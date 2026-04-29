import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function buildVariantKey(row) {
  const parts = [];
  if (row.normalized_weight) parts.push(`w:${row.normalized_weight}`);
  if (row.normalized_volume) parts.push(`v:${row.normalized_volume}`);
  if (row.normalized_pack_count) parts.push(`p:${row.normalized_pack_count}`);
  if (row.normalized_flavor) parts.push(`f:${row.normalized_flavor}`);
  if (row.normalized_type) parts.push(`t:${row.normalized_type}`);
  return parts.length > 0 ? parts.join('|') : `variant:${row.variant_name || 'unknown'}`;
}

function buildVariantDisplayName(row) {
  const parts = [];
  if (row.normalized_weight) parts.push(row.normalized_weight);
  if (row.normalized_volume) parts.push(row.normalized_volume);
  if (row.normalized_pack_count) parts.push(`x${row.normalized_pack_count}`);
  if (row.normalized_flavor) parts.push(row.normalized_flavor);
  if (row.normalized_type) parts.push(row.normalized_type);
  return parts.length > 0 ? parts.join(' ') : (row.variant_name || 'Unknown');
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const jobRec = await base44.asServiceRole.entities.VariantCrawlJob.create({
    job_type: 'transform_variant_summary',
    started_at: new Date().toISOString(),
    status: 'running',
    source_name: 'transformVariantSummary',
  });

  try {
    const rawRows = await base44.asServiceRole.entities.MarketVariantSnapshotRaw.list('-synced_at', 2000);
    const existingSummaries = await base44.asServiceRole.entities.MarketVariantSummaryDaily.list('-created_date', 2000);
    const products = await base44.asServiceRole.entities.Product.list('-created_date', 500);

    // Group raw rows by sku + snapshot_date + variant_key
    const groups = {};
    for (const row of rawRows) {
      if (!row.variant_price || !row.sku) continue;
      const vKey = buildVariantKey(row);
      const groupKey = `${row.sku}||${row.snapshot_date || new Date().toISOString().slice(0, 10)}||${vKey}`;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          sku: row.sku,
          summary_date: row.snapshot_date || new Date().toISOString().slice(0, 10),
          variant_key: vKey,
          variant_display_name: buildVariantDisplayName(row),
          normalized_weight: row.normalized_weight || '',
          normalized_volume: row.normalized_volume || '',
          normalized_pack_count: row.normalized_pack_count || null,
          normalized_flavor: row.normalized_flavor || '',
          normalized_type: row.normalized_type || '',
          rows: [],
        };
      }
      groups[groupKey].rows.push(row);
    }

    // Build summary map from existing records for upsert
    const summaryMap = {};
    for (const s of existingSummaries) {
      const k = `${s.sku}||${s.summary_date}||${s.variant_key}`;
      summaryMap[k] = s;
    }

    let created = 0;
    let updated = 0;

    // Track per-sku: best (lowest price) competitor
    const skuBest = {};

    for (const [groupKey, group] of Object.entries(groups)) {
      const prices = group.rows.map(r => r.variant_price).filter(Boolean).sort((a, b) => a - b);
      const units = group.rows.reduce((sum, r) => sum + (r.variant_sold_est || 0), 0);

      // Find strongest competitor: highest sold_est or lowest price
      const strongest = group.rows.reduce((best, r) => {
        if (!best) return r;
        return (r.variant_sold_est || 0) > (best.variant_sold_est || 0) ? r : best;
      }, null);

      const summaryData = {
        sku: group.sku,
        summary_date: group.summary_date,
        variant_key: group.variant_key,
        variant_display_name: group.variant_display_name,
        normalized_weight: group.normalized_weight,
        normalized_volume: group.normalized_volume,
        normalized_pack_count: group.normalized_pack_count,
        normalized_flavor: group.normalized_flavor,
        normalized_type: group.normalized_type,
        competitor_price_low: prices[0] || null,
        competitor_price_avg: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
        competitor_price_high: prices[prices.length - 1] || null,
        competitor_count: prices.length,
        strongest_competitor_price: strongest?.variant_price || null,
        strongest_competitor_shop: strongest?.competitor_shop_name || '',
        estimated_variant_units: units || null,
      };

      if (summaryMap[groupKey]) {
        await base44.asServiceRole.entities.MarketVariantSummaryDaily.update(summaryMap[groupKey].id, summaryData);
        updated++;
      } else {
        await base44.asServiceRole.entities.MarketVariantSummaryDaily.create(summaryData);
        created++;
      }

      // Track best competitor price per sku (lowest strong competitor)
      if (!skuBest[group.sku] || (summaryData.strongest_competitor_price && summaryData.strongest_competitor_price < skuBest[group.sku].price)) {
        skuBest[group.sku] = {
          price: summaryData.strongest_competitor_price,
          key: group.variant_key,
        };
      }
    }

    // Update products with variant-level intelligence
    const now = new Date().toISOString();
    let productsUpdated = 0;
    for (const product of products) {
      if (skuBest[product.sku]) {
        await base44.asServiceRole.entities.Product.update(product.id, {
          market_variant_ready: true,
          market_variant_last_sync_at: now,
          strongest_variant_competitor_price: skuBest[product.sku].price,
          strongest_variant_key: skuBest[product.sku].key,
        });
        productsUpdated++;
      }
    }

    const summary = `Processed ${rawRows.length} raw rows → ${created} summaries created, ${updated} updated. ${productsUpdated} products enriched.`;

    await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
      finished_at: now,
      status: 'success',
      records_processed: created + updated,
      response_summary: summary,
    });

    return Response.json({
      success: true,
      raw_rows_processed: rawRows.length,
      summaries_created: created,
      summaries_updated: updated,
      products_updated: productsUpdated,
    });
  } catch (err) {
    await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
      finished_at: new Date().toISOString(),
      status: 'failed',
      error_message: err.message,
    });
    return Response.json({ error: err.message }, { status: 500 });
  }
});