import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { rows: manualRows, connection_id } = body;

    const today = new Date().toISOString().split('T')[0];
    const startedAt = new Date().toISOString();

    // Load active connection
    let connection = null;
    if (connection_id) {
      const conns = await base44.asServiceRole.entities.MarketConnection.filter({ id: connection_id });
      connection = conns[0];
    } else {
      const conns = await base44.asServiceRole.entities.MarketConnection.filter({ is_active: true });
      connection = conns[0];
    }

    // Log job start
    const job = await base44.asServiceRole.entities.MarketSyncJob.create({
      job_type: 'market_snapshot',
      started_at: startedAt,
      status: 'running',
      request_payload: JSON.stringify({ source_type: connection?.source_type || 'manual', connection_id }),
    });

    let rawRows = [];
    let sourceType = 'manual_import';

    if (manualRows && Array.isArray(manualRows) && manualRows.length > 0) {
      // Manual rows passed directly in payload
      rawRows = manualRows;
      sourceType = 'manual_import';
    } else if (connection) {
      sourceType = connection.source_type;

      if (connection.source_type === 'metric_api' && connection.base_url) {
        // Fetch from Metric API
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (connection.api_key) headers['Authorization'] = `Bearer ${connection.api_key}`;
          const resp = await fetch(`${connection.base_url}/market-data`, { method: 'GET', headers, signal: AbortSignal.timeout(15000) });
          if (resp.ok) {
            const data = await resp.json();
            rawRows = Array.isArray(data) ? data : (data.data || data.rows || data.items || []);
          } else {
            throw new Error(`API returned HTTP ${resp.status}`);
          }
        } catch (fetchErr) {
          await base44.asServiceRole.entities.MarketSyncJob.update(job.id, {
            status: 'failed',
            finished_at: new Date().toISOString(),
            error_message: `API fetch failed: ${fetchErr.message}`,
          });
          if (connection) {
            await base44.asServiceRole.entities.MarketConnection.update(connection.id, { status: 'error', last_error: fetchErr.message });
          }
          return Response.json({ success: false, error: fetchErr.message });
        }
      } else if (connection.source_type === 'apify' && connection.api_key) {
        // Apify: rows should come through webhook or direct dataset fetch
        // Without a specific actor/dataset ID, we return a helpful message
        rawRows = [];
        // If base_url contains a dataset ID, try to fetch it
        if (connection.base_url && connection.base_url.includes('datasets')) {
          try {
            const resp = await fetch(`${connection.base_url}/items?token=${connection.api_key}`, { signal: AbortSignal.timeout(15000) });
            if (resp.ok) rawRows = await resp.json();
          } catch (_) { rawRows = []; }
        }
      }
    }

    // Normalize and insert raw rows
    const synced_at = new Date().toISOString();
    let inserted = 0;

    for (const row of rawRows) {
      const normalized = {
        source_type: sourceType,
        snapshot_date: row.snapshot_date || row.date || today,
        sku: row.sku || row.product_id || null,
        keyword: row.keyword || row.search_keyword || null,
        competitor_shop_name: row.competitor_shop_name || row.shop_name || row.seller_name || null,
        competitor_product_name: row.competitor_product_name || row.product_name || row.title || null,
        competitor_product_url: row.competitor_product_url || row.product_url || row.url || null,
        competitor_price: parseFloat(row.competitor_price || row.price || row.current_price) || null,
        competitor_original_price: parseFloat(row.competitor_original_price || row.original_price) || null,
        estimated_units_sold: parseFloat(row.estimated_units_sold || row.units_sold || row.sales) || null,
        estimated_revenue: parseFloat(row.estimated_revenue || row.revenue) || null,
        rank_position: parseFloat(row.rank_position || row.rank || row.position) || null,
        rating_value: parseFloat(row.rating_value || row.rating) || null,
        rating_count: parseFloat(row.rating_count || row.ratings) || null,
        review_count: parseFloat(row.review_count || row.reviews) || null,
        raw_json: JSON.stringify(row),
        synced_at,
      };
      if (!normalized.competitor_price) continue; // skip rows with no price
      await base44.asServiceRole.entities.MarketPriceSnapshotRaw.create(normalized);
      inserted++;
    }

    const finishedAt = new Date().toISOString();

    await base44.asServiceRole.entities.MarketSyncJob.update(job.id, {
      status: 'success',
      finished_at: finishedAt,
      records_processed: inserted,
      response_summary: `Inserted ${inserted} raw market rows from ${sourceType}`,
    });

    if (connection) {
      await base44.asServiceRole.entities.MarketConnection.update(connection.id, {
        status: 'connected',
        last_sync_at: finishedAt,
        last_error: null,
      });
    }

    return Response.json({ success: true, inserted, source_type: sourceType, date: today });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});