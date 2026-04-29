import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const startedAt = new Date().toISOString();
    const job = await base44.asServiceRole.entities.MarketSyncJob.create({
      job_type: 'full_market_sync',
      started_at: startedAt,
      status: 'running',
      request_payload: JSON.stringify(body),
    });

    const errors = [];
    let rawInserted = 0;
    let summariesCreated = 0;
    let productsUpdated = 0;

    // Step 1: Sync raw data (pass-through any manual rows)
    try {
      const syncRes = await base44.asServiceRole.functions.invoke('marketSyncRawData', body);
      rawInserted = syncRes?.inserted || 0;
    } catch (err) {
      errors.push(`Raw sync: ${err.message}`);
    }

    // Step 2: Transform summaries
    try {
      const transformRes = await base44.asServiceRole.functions.invoke('marketTransformSummary', {});
      summariesCreated = transformRes?.summaries_created || 0;
      productsUpdated = transformRes?.products_updated || 0;
    } catch (err) {
      errors.push(`Transform: ${err.message}`);
    }

    // Step 3: Update active connection last_sync_at
    try {
      const conns = await base44.asServiceRole.entities.MarketConnection.filter({ is_active: true });
      if (conns.length > 0) {
        await base44.asServiceRole.entities.MarketConnection.update(conns[0].id, {
          last_sync_at: new Date().toISOString(),
          status: errors.length === 0 ? 'connected' : 'error',
          last_error: errors.length > 0 ? errors.join('; ') : null,
        });
      }
    } catch (_) {}

    const finishedAt = new Date().toISOString();
    const succeeded = errors.length === 0;

    await base44.asServiceRole.entities.MarketSyncJob.update(job.id, {
      status: succeeded ? 'success' : 'failed',
      finished_at: finishedAt,
      records_processed: rawInserted + summariesCreated,
      response_summary: `Full sync: ${rawInserted} raw rows, ${summariesCreated} summaries, ${productsUpdated} products updated`,
      error_message: errors.length > 0 ? errors.join('; ') : null,
    });

    return Response.json({
      success: succeeded,
      raw_rows_inserted: rawInserted,
      summaries_created: summariesCreated,
      products_updated: productsUpdated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});