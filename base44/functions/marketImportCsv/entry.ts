import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function parseCsv(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/\s+/g, '_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] ?? ''; });
    rows.push(obj);
  }
  return rows;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { csv_text, rows: jsonRows, snapshot_date, sku_override } = body;

    const today = new Date().toISOString().split('T')[0];
    const startedAt = new Date().toISOString();

    const job = await base44.asServiceRole.entities.MarketSyncJob.create({
      job_type: 'market_snapshot',
      started_at: startedAt,
      status: 'running',
      request_payload: JSON.stringify({ source: 'csv_import', snapshot_date }),
    });

    let rawRows = [];
    if (csv_text) {
      rawRows = parseCsv(csv_text);
    } else if (jsonRows && Array.isArray(jsonRows)) {
      rawRows = jsonRows;
    }

    if (rawRows.length === 0) {
      await base44.asServiceRole.entities.MarketSyncJob.update(job.id, {
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: 'No rows found in CSV or rows array',
      });
      return Response.json({ success: false, error: 'No rows to import' });
    }

    const synced_at = new Date().toISOString();
    let inserted = 0;
    let skipped = 0;

    for (const row of rawRows) {
      const price = parseFloat(row.competitor_price || row.price || 0);
      if (!price) { skipped++; continue; }

      const normalized = {
        source_type: 'metric_csv',
        snapshot_date: row.snapshot_date || snapshot_date || today,
        sku: sku_override || row.sku || null,
        keyword: row.keyword || null,
        competitor_shop_name: row.competitor_shop_name || row.shop_name || null,
        competitor_product_name: row.competitor_product_name || row.product_name || null,
        competitor_product_url: row.competitor_product_url || row.url || null,
        competitor_price: price,
        competitor_original_price: parseFloat(row.competitor_original_price || row.original_price) || null,
        estimated_units_sold: parseFloat(row.estimated_units_sold || row.units_sold) || null,
        estimated_revenue: parseFloat(row.estimated_revenue || row.revenue) || null,
        rank_position: parseFloat(row.rank_position || row.rank) || null,
        rating_value: parseFloat(row.rating_value || row.rating) || null,
        rating_count: parseFloat(row.rating_count) || null,
        review_count: parseFloat(row.review_count) || null,
        raw_json: JSON.stringify(row),
        synced_at,
      };

      await base44.asServiceRole.entities.MarketPriceSnapshotRaw.create(normalized);
      inserted++;
    }

    await base44.asServiceRole.entities.MarketSyncJob.update(job.id, {
      status: 'success',
      finished_at: new Date().toISOString(),
      records_processed: inserted,
      response_summary: `CSV import: ${inserted} inserted, ${skipped} skipped (no price)`,
    });

    return Response.json({ success: true, inserted, skipped, total_rows: rawRows.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});