import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function rankBucket(rank) {
  if (!rank) return 'OUTSIDE_50';
  if (rank <= 10) return 'TOP_10';
  if (rank <= 20) return 'TOP_20';
  if (rank <= 50) return 'TOP_50';
  return 'OUTSIDE_50';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { date_filter } = body;

    const startedAt = new Date().toISOString();
    const job = await base44.asServiceRole.entities.MarketSyncJob.create({
      job_type: 'transform_market',
      started_at: startedAt,
      status: 'running',
      request_payload: JSON.stringify({ date_filter }),
    });

    // Load all raw snapshots (recent first)
    const allRaw = await base44.asServiceRole.entities.MarketPriceSnapshotRaw.list('-snapshot_date', 5000);

    if (allRaw.length === 0) {
      await base44.asServiceRole.entities.MarketSyncJob.update(job.id, {
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: 'No raw snapshot rows found. Run market sync first.',
      });
      return Response.json({ success: false, error: 'No raw rows to transform' });
    }

    // Group by sku + snapshot_date
    const groups = {};
    for (const row of allRaw) {
      if (!row.sku || !row.competitor_price) continue;
      const key = `${row.sku}::${row.snapshot_date}`;
      if (!groups[key]) groups[key] = { sku: row.sku, snapshot_date: row.snapshot_date, source_type: row.source_type, rows: [] };
      groups[key].rows.push(row);
    }

    const summaries = Object.values(groups);
    let summarized = 0;
    let productsUpdated = 0;

    // Load existing products for lookup
    const allProducts = await base44.asServiceRole.entities.Product.list('-created_date', 500);
    const productBySku = {};
    for (const p of allProducts) productBySku[p.sku] = p;

    for (const group of summaries) {
      const prices = group.rows.map(r => parseFloat(r.competitor_price)).filter(p => p > 0);
      if (prices.length === 0) continue;

      const market_low  = Math.min(...prices);
      const market_high = Math.max(...prices);
      const market_avg  = prices.reduce((a, b) => a + b, 0) / prices.length;

      // Benchmark competitor price: use the most common lowest reliable price
      // Sort prices and take the 25th percentile (reliable low)
      const sortedPrices = [...prices].sort((a, b) => a - b);
      const p25idx = Math.floor(sortedPrices.length * 0.25);
      const competitor_price = sortedPrices[p25idx] || market_low;

      const competitor_count = group.rows.length;
      const estimated_market_units = group.rows.reduce((s, r) => s + (r.estimated_units_sold || 0), 0) || null;
      const estimated_market_revenue = group.rows.reduce((s, r) => s + (r.estimated_revenue || 0), 0) || null;

      // Best rank = lowest rank number
      const ranks = group.rows.map(r => r.rank_position).filter(r => r > 0);
      const current_rank = ranks.length > 0 ? Math.min(...ranks) : null;
      const rank_bucket = rankBucket(current_rank);

      // Upsert into market_summary_daily
      const existing = await base44.asServiceRole.entities.MarketSummaryDaily.filter({ sku: group.sku, summary_date: group.snapshot_date });
      const summaryPayload = {
        sku: group.sku,
        summary_date: group.snapshot_date,
        market_low,
        market_avg: parseFloat(market_avg.toFixed(0)),
        market_high,
        competitor_price: parseFloat(competitor_price.toFixed(0)),
        competitor_count,
        estimated_market_units,
        estimated_market_revenue,
        current_rank,
        rank_bucket,
        source_type: group.source_type,
      };

      if (existing.length > 0) {
        await base44.asServiceRole.entities.MarketSummaryDaily.update(existing[0].id, summaryPayload);
      } else {
        await base44.asServiceRole.entities.MarketSummaryDaily.create(summaryPayload);
      }
      summarized++;

      // Update product market intelligence fields (never touch cost, role, min/max_price)
      const product = productBySku[group.sku];
      if (product) {
        await base44.asServiceRole.entities.Product.update(product.id, {
          market_low,
          market_avg: parseFloat(market_avg.toFixed(0)),
          market_high,
          competitor_price: parseFloat(competitor_price.toFixed(0)),
          competitor_count,
          current_rank,
          last_market_sync_at: new Date().toISOString(),
          last_market_source: group.source_type,
        });
        productsUpdated++;
      }
    }

    const finishedAt = new Date().toISOString();
    await base44.asServiceRole.entities.MarketSyncJob.update(job.id, {
      status: 'success',
      finished_at: finishedAt,
      records_processed: summarized,
      response_summary: `Transformed ${allRaw.length} raw rows → ${summarized} daily summaries, ${productsUpdated} products updated`,
    });

    return Response.json({ success: true, raw_rows: allRaw.length, summaries_created: summarized, products_updated: productsUpdated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});