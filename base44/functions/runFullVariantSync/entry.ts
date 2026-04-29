import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const jobRec = await base44.asServiceRole.entities.VariantCrawlJob.create({
    job_type: 'full_variant_sync',
    started_at: new Date().toISOString(),
    status: 'running',
    source_name: 'runFullVariantSync',
  });

  try {
    // Step 1: Import seeds from parent market data
    const seedsRes = await base44.asServiceRole.functions.invoke('importMarketSeedsFromParentData', {});
    const seedsCreated = seedsRes?.seeds_created || 0;
    const seedsUpdated = seedsRes?.seeds_updated || 0;

    // Step 2: Queue the crawl
    const queueRes = await base44.asServiceRole.functions.invoke('queueVariantCrawl', {});
    const seedsQueued = queueRes?.queued_count || 0;

    // Step 3: Transform existing raw variants into summaries
    const transformRes = await base44.asServiceRole.functions.invoke('transformVariantSummary', {});
    const rawVariantsProcessed = transformRes?.raw_rows_processed || 0;
    const summariesCreated = transformRes?.summaries_created || 0;
    const productsUpdated = transformRes?.products_updated || 0;

    const summary = [
      `Seeds: ${seedsCreated} created, ${seedsUpdated} updated`,
      `Queued: ${seedsQueued}`,
      `Raw variants processed: ${rawVariantsProcessed}`,
      `Summaries created: ${summariesCreated}`,
      `Products updated: ${productsUpdated}`,
      'Note: External crawler webhook results arrive asynchronously via receiveVariantCrawlerWebhook.',
    ].join(' | ');

    await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
      finished_at: new Date().toISOString(),
      status: 'success',
      records_processed: seedsCreated + seedsUpdated + rawVariantsProcessed,
      response_summary: summary,
    });

    return Response.json({
      success: true,
      seeds_created: seedsCreated,
      seeds_updated: seedsUpdated,
      seeds_queued: seedsQueued,
      raw_variants_processed: rawVariantsProcessed,
      summaries_created: summariesCreated,
      products_updated: productsUpdated,
      note: 'External crawler payload has been queued. Run receiveVariantCrawlerWebhook once the crawler sends results back.',
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