import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function normalizeRow(row) {
  return {
    snapshot_date: row.snapshot_date || new Date().toISOString().slice(0, 10),
    sku: row.sku || '',
    seed_product_link: row.seed_product_link || row.product_link || '',
    parent_product_id: row.parent_product_id || '',
    parent_product_name: row.parent_product_name || '',
    competitor_shop_name: row.competitor_shop_name || '',
    competitor_shop_link: row.competitor_shop_link || '',
    competitor_product_link: row.competitor_product_link || '',
    competitor_product_id: row.competitor_product_id || '',
    variant_id: row.variant_id || '',
    variant_name: row.variant_name || '',
    variant_group_1: row.variant_group_1 || '',
    variant_group_2: row.variant_group_2 || '',
    normalized_weight: row.normalized_weight || '',
    normalized_volume: row.normalized_volume || '',
    normalized_pack_count: row.normalized_pack_count || null,
    normalized_flavor: row.normalized_flavor || '',
    normalized_type: row.normalized_type || '',
    variant_price: parseFloat(row.variant_price) || null,
    variant_original_price: parseFloat(row.variant_original_price) || null,
    variant_stock: row.variant_stock !== undefined ? parseInt(row.variant_stock) : null,
    variant_sold_est: row.variant_sold_est !== undefined ? parseInt(row.variant_sold_est) : null,
    currency: row.currency || 'VND',
    image_url: row.image_url || '',
    raw_json: row.raw_json ? (typeof row.raw_json === 'string' ? row.raw_json : JSON.stringify(row.raw_json)) : '',
    source_type: row.source_type || 'webhook',
    synced_at: new Date().toISOString(),
  };
}

// Accepts nested format: { sku, seed_product_link, variants: [...] }
function flattenPayload(payload) {
  const rows = [];
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (Array.isArray(item.variants)) {
        for (const v of item.variants) {
          rows.push({ ...item, ...v, variants: undefined });
        }
      } else {
        rows.push(item);
      }
    }
  } else if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.variants)) {
      for (const v of payload.variants) {
        rows.push({ ...payload, ...v, variants: undefined });
      }
    } else {
      rows.push(payload);
    }
  }
  return rows;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const jobRec = await base44.asServiceRole.entities.VariantCrawlJob.create({
    job_type: 'webhook_receive',
    started_at: new Date().toISOString(),
    status: 'running',
    source_name: 'receiveVariantCrawlerWebhook',
  });

  try {
    const body = await req.json();
    const rawRows = flattenPayload(body);

    if (!rawRows || rawRows.length === 0) {
      await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
        finished_at: new Date().toISOString(),
        status: 'failed',
        error_message: 'Empty or invalid payload',
      });
      return Response.json({ error: 'Empty or invalid payload' }, { status: 400 });
    }

    let inserted = 0;
    let failed = 0;
    const updatedSeeds = new Set();
    const failedSeeds = new Map();

    for (const row of rawRows) {
      if (!row.variant_price) { failed++; continue; }
      const normalized = normalizeRow(row);
      await base44.asServiceRole.entities.MarketVariantSnapshotRaw.create(normalized);
      inserted++;

      const link = normalized.seed_product_link;
      if (link) updatedSeeds.add(link);
    }

    // Update seed statuses
    if (updatedSeeds.size > 0) {
      const seeds = await base44.asServiceRole.entities.MarketProductSeed.list('-created_date', 500);
      const now = new Date().toISOString();
      for (const seed of seeds) {
        if (updatedSeeds.has(seed.product_link)) {
          await base44.asServiceRole.entities.MarketProductSeed.update(seed.id, {
            crawl_status: 'crawled',
            last_crawled_at: now,
            last_error: '',
          });
        }
        if (failedSeeds.has(seed.product_link)) {
          await base44.asServiceRole.entities.MarketProductSeed.update(seed.id, {
            crawl_status: 'failed',
            last_error: failedSeeds.get(seed.product_link),
          });
        }
      }
    }

    await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
      finished_at: new Date().toISOString(),
      status: 'success',
      records_processed: inserted,
      response_summary: `Inserted: ${inserted} variant rows. Failed: ${failed}. Seeds updated: ${updatedSeeds.size}.`,
    });

    return Response.json({ success: true, inserted, failed, seeds_updated: updatedSeeds.size });
  } catch (err) {
    await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
      finished_at: new Date().toISOString(),
      status: 'failed',
      error_message: err.message,
    });
    return Response.json({ error: err.message }, { status: 500 });
  }
});