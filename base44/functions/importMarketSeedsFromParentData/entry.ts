import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const jobRec = await base44.asServiceRole.entities.VariantCrawlJob.create({
    job_type: 'queue_seed',
    started_at: new Date().toISOString(),
    status: 'running',
    source_name: 'import_seeds',
  });

  try {
    // Load raw market snapshots that have product links
    const rawRows = await base44.asServiceRole.entities.MarketPriceSnapshotRaw.list('-synced_at', 500);
    const existingSeeds = await base44.asServiceRole.entities.MarketProductSeed.list('-created_date', 1000);

    const seedMap = {};
    for (const s of existingSeeds) {
      if (s.product_link) seedMap[s.product_link] = s;
    }

    let seedsCreated = 0;
    let seedsUpdated = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const row of rawRows) {
      if (!row.competitor_product_url && !row.sku) continue;
      const link = row.competitor_product_url;
      if (!link) continue;

      // Detect multi-variant: if the row has both min/max price range
      const priceMin = row.competitor_price || 0;
      const priceMax = row.competitor_original_price || priceMin;
      const needsVariant = (priceMax - priceMin) > (priceMin * 0.05) ||
        /combo|pack|set|kg|g\b|ml|l\b|vị|vi\b|loại/i.test(row.competitor_product_name || '');

      if (seedMap[link]) {
        // Update existing
        await base44.asServiceRole.entities.MarketProductSeed.update(seedMap[link].id, {
          product_name: seedMap[link].product_name || row.competitor_product_name,
          parent_price: row.competitor_price,
          sold_count: row.estimated_units_sold || seedMap[link].sold_count,
          revenue: row.estimated_revenue || seedMap[link].revenue,
          needs_variant_analysis: needsVariant,
          crawl_status: seedMap[link].crawl_status === 'ignored' ? 'ignored' : (needsVariant ? 'pending' : seedMap[link].crawl_status),
        });
        seedsUpdated++;
      } else {
        // Create new seed
        await base44.asServiceRole.entities.MarketProductSeed.create({
          sku: row.sku || '',
          source_type: row.source_type === 'metric_csv' ? 'metric_csv' : 'metric_api',
          seed_date: today,
          product_name: row.competitor_product_name || '',
          product_link: link,
          shop_name: row.competitor_shop_name || '',
          parent_price: row.competitor_price || 0,
          sold_count: row.estimated_units_sold || 0,
          revenue: row.estimated_revenue || 0,
          needs_variant_analysis: needsVariant,
          crawl_status: 'pending',
        });
        seedMap[link] = { product_link: link };
        seedsCreated++;
      }
    }

    await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
      finished_at: new Date().toISOString(),
      status: 'success',
      records_processed: seedsCreated + seedsUpdated,
      response_summary: `Seeds created: ${seedsCreated}, updated: ${seedsUpdated}`,
    });

    return Response.json({ success: true, seeds_created: seedsCreated, seeds_updated: seedsUpdated });
  } catch (err) {
    await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
      finished_at: new Date().toISOString(),
      status: 'failed',
      error_message: err.message,
    });
    return Response.json({ error: err.message }, { status: 500 });
  }
});