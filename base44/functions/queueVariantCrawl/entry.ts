import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const jobRec = await base44.asServiceRole.entities.VariantCrawlJob.create({
    job_type: 'queue_seed',
    started_at: new Date().toISOString(),
    status: 'running',
    source_name: 'queue_variant_crawl',
  });

  try {
    // Load seeds that need crawling
    const allSeeds = await base44.asServiceRole.entities.MarketProductSeed.list('-created_date', 500);
    const eligible = allSeeds.filter(s =>
      s.needs_variant_analysis &&
      (s.crawl_status === 'pending' || s.crawl_status === 'failed')
    );

    if (eligible.length === 0) {
      await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
        finished_at: new Date().toISOString(),
        status: 'success',
        records_processed: 0,
        response_summary: 'No eligible seeds found',
      });
      return Response.json({ success: true, queued_count: 0, payload: null, note: 'No eligible seeds.' });
    }

    // Build Apify-friendly payload
    const today = new Date().toISOString().slice(0, 10);
    const items = eligible.map(s => ({
      sku: s.sku,
      product_link: s.product_link,
      product_id: s.product_id || '',
      product_name: s.product_name || '',
      brand: s.brand || '',
      seed_id: s.id,
    }));

    const payload = {
      run_source: 'base44_variant_deep_crawl',
      snapshot_date: today,
      webhook_url: '[YOUR_BASE44_FUNCTION_URL]/receiveVariantCrawlerWebhook',
      items,
    };

    // Mark all selected seeds as queued
    for (const s of eligible) {
      await base44.asServiceRole.entities.MarketProductSeed.update(s.id, {
        crawl_status: 'queued',
      });
    }

    await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
      finished_at: new Date().toISOString(),
      status: 'success',
      records_processed: eligible.length,
      request_payload: JSON.stringify(payload).slice(0, 4000),
      response_summary: `Queued ${eligible.length} seeds. Send payload to Apify or your custom crawler.`,
    });

    return Response.json({
      success: true,
      queued_count: eligible.length,
      payload,
      note: 'Send this payload to your Apify actor or external crawler. Base44 will receive results via receiveVariantCrawlerWebhook.',
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