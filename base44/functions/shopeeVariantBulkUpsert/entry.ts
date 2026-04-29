import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Normalize a single variant row, accepting all alias field names
function normalizeRow(row) {
  return {
    snapshot_date: row.snapshot_date || new Date().toISOString().slice(0, 10),
    sku: (row.sku || '').trim(),
    seed_product_link: row.seed_product_link || row.product_link || '',
    parent_product_id: row.parent_product_id || row.product_id || '',
    parent_product_name: row.parent_product_name || row.product_name || row.name || '',
    competitor_shop_name: row.competitor_shop_name || '',
    competitor_shop_link: row.competitor_shop_link || '',
    competitor_product_link: row.competitor_product_link || '',
    competitor_product_id: row.competitor_product_id || '',
    variant_id: row.variant_id || '',
    variant_name: row.variant_name || '',
    variant_group_1: row.variant_group_1 || '',
    variant_group_2: row.variant_group_2 || '',
    variant_group_3: row.variant_group_3 || '',
    normalized_weight: row.normalized_weight || '',
    normalized_volume: row.normalized_volume || '',
    normalized_pack_count: row.normalized_pack_count != null ? Number(row.normalized_pack_count) : null,
    normalized_flavor: row.normalized_flavor || '',
    normalized_type: row.normalized_type || '',
    variant_price: parseFloat(row.variant_price ?? row.price) || null,
    variant_original_price: parseFloat(row.variant_original_price ?? row.originalPrice) || null,
    variant_stock: row.variant_stock != null ? parseInt(row.variant_stock) : (row.stock != null ? parseInt(row.stock) : null),
    variant_sold_est: row.variant_sold_est != null ? parseInt(row.variant_sold_est) : (row.sold != null ? parseInt(row.sold) : null),
    currency: row.currency || 'VND',
    image_url: row.image_url || '',
    raw_json: row.raw_json || row.raw
      ? (typeof (row.raw_json || row.raw) === 'string' ? (row.raw_json || row.raw) : JSON.stringify(row.raw_json || row.raw))
      : '',
    source_type: row.source_type || 'apify_webhook',
    synced_at: new Date().toISOString(),
  };
}

// Flatten nested { sku, product_link, variants: [...] } format
function flattenItems(items) {
  const rows = [];
  for (const item of items) {
    if (Array.isArray(item.variants)) {
      for (const v of item.variants) {
        rows.push({ ...item, ...v, variants: undefined });
      }
    } else {
      rows.push(item);
    }
  }
  return rows;
}

// Fetch items from Apify dataset
async function fetchApifyDataset(datasetId) {
  const token = Deno.env.get('APIFY_TOKEN');
  if (!token) throw new Error('APIFY_TOKEN secret not set');
  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&clean=true&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Apify dataset fetch failed: ${res.status}`);
  return await res.json();
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Create job record (no auth check — this is a webhook endpoint)
  const jobRec = await base44.asServiceRole.entities.VariantCrawlJob.create({
    job_type: 'webhook_receive',
    started_at: new Date().toISOString(),
    status: 'running',
    source_name: 'shopeeVariantBulkUpsert',
  });

  try {
    const body = await req.json();

    let rawItems = [];

    // Format 1: body is array
    if (Array.isArray(body)) {
      rawItems = body;
    }
    // Format 2: body.items array (direct actor output or test payload)
    else if (Array.isArray(body.items)) {
      rawItems = body.items;
    }
    // Format 3: body.data array
    else if (Array.isArray(body.data)) {
      rawItems = body.data;
    }
    // Format 4: Apify platform webhook event — fetch from dataset
    else {
      const datasetId =
        body?.resource?.defaultDatasetId ||
        body?.eventData?.defaultDatasetId ||
        body?.defaultDatasetId;

      if (datasetId) {
        rawItems = await fetchApifyDataset(datasetId);
      }
    }

    if (!rawItems || rawItems.length === 0) {
      await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
        finished_at: new Date().toISOString(),
        status: 'failed',
        records_processed: 0,
        error_message: 'Empty or unrecognized payload — no items found',
        request_payload: JSON.stringify(body).slice(0, 500),
      });
      return Response.json({
        success: false,
        received: 0,
        inserted: 0,
        failed: 0,
        seeds_updated: 0,
        errors: ['Empty or unrecognized payload — no items found'],
      }, { status: 400 });
    }

    // Flatten nested variant arrays
    const flatItems = flattenItems(rawItems);
    const received = flatItems.length;

    let inserted = 0;
    let failed = 0;
    const errors = [];
    const succeededLinks = new Set();

    for (const row of flatItems) {
      // SKU is required per item
      if (!row.sku || !String(row.sku).trim()) {
        failed++;
        errors.push(`Skipped row (missing sku): ${JSON.stringify(row).slice(0, 120)}`);
        continue;
      }

      try {
        const normalized = normalizeRow(row);
        await base44.asServiceRole.entities.MarketVariantSnapshotRaw.create(normalized);
        inserted++;
        if (normalized.seed_product_link) succeededLinks.add(normalized.seed_product_link);
      } catch (e) {
        failed++;
        errors.push(`Row insert error (sku=${row.sku}): ${e.message}`);
      }
    }

    // Update seed statuses
    let seedsUpdated = 0;
    if (succeededLinks.size > 0) {
      try {
        const seeds = await base44.asServiceRole.entities.MarketProductSeed.list('-created_date', 1000);
        const now = new Date().toISOString();
        for (const seed of seeds) {
          if (succeededLinks.has(seed.product_link)) {
            await base44.asServiceRole.entities.MarketProductSeed.update(seed.id, {
              crawl_status: 'crawled',
              last_crawled_at: now,
              last_error: '',
            });
            seedsUpdated++;
          }
        }
      } catch (e) {
        errors.push(`Seed update error: ${e.message}`);
      }
    }

    await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
      finished_at: new Date().toISOString(),
      status: inserted > 0 ? 'success' : 'failed',
      records_processed: inserted,
      response_summary: `received=${received} inserted=${inserted} failed=${failed} seeds_updated=${seedsUpdated}`,
      error_message: errors.length > 0 ? errors.slice(0, 3).join('; ') : '',
    });

    return Response.json({
      success: true,
      received,
      inserted,
      failed,
      seeds_updated: seedsUpdated,
      errors,
    });
  } catch (err) {
    await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
      finished_at: new Date().toISOString(),
      status: 'failed',
      error_message: err.message,
    });
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
});