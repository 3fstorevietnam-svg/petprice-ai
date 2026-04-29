import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Normalize Shopee URL: remove hash and common tracking params
function normalizeShopeeUrl(url) {
  try {
    const u = new URL(url.trim());
    // Remove tracking params
    const paramsToRemove = ['af_siteid', 'af_subsource', 'af_click_lookback', 'pid', 'c', 'is_retargeting', 'smtt', 'sourceFrom', 'af_ad', 'af_ad_id', 'deep_and_deferred', 'utm_source', 'utm_medium', 'utm_campaign', 'af_channel', 'fbclid', 'gclid', 'referrer_browserId', 'spm'];
    paramsToRemove.forEach(p => u.searchParams.delete(p));
    u.hash = '';
    return u.toString();
  } catch {
    return url.trim();
  }
}

// Extract product_id (itemId) from Shopee URLs
function extractProductId(url) {
  try {
    const u = new URL(url.trim());

    // Format 1: /product/{shopId}/{itemId}
    const productMatch = u.pathname.match(/\/product\/(\d+)\/(\d+)/);
    if (productMatch) return productMatch[2];

    // Format 2: -i.{shopId}.{itemId} at end of path
    const iMatch = u.pathname.match(/-i\.(\d+)\.(\d+)/);
    if (iMatch) return iMatch[2];

    // Format 3: query params shopid and itemid
    const itemId = u.searchParams.get('itemid');
    if (itemId) return itemId;

    return null;
  } catch {
    return null;
  }
}

// Parse CSV text into array of objects
function parseCsv(csvText) {
  const lines = csvText.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = cols[idx] || ''; });
    rows.push(obj);
  }
  return rows;
}

// Map a row object to normalized item
function mapRow(row) {
  // Support normal columns
  let sku = row['sku'] || row['SKU'] || '';
  let productName = row['product_name'] || row['name'] || '';
  let productLink = row['product_link'] || row['link'] || '';

  // Support Metric columns
  if (!productLink) productLink = row['Link sản phẩm'] || row['Link san pham'] || '';
  if (!productName) productName = row['Tên sản phẩm'] || row['Ten san pham'] || '';

  // If sku missing, try Metric "Mã sản phẩm" column — parse shopId/itemId from it
  if (!sku) {
    const masp = row['Mã sản phẩm'] || row['Ma san pham'] || '';
    if (masp) {
      // Format: 1__itemId__shopId  (sometimes reversed)
      const parts = masp.split('__').filter(Boolean);
      if (parts.length >= 3) {
        sku = ''; // will be derived from product_id below
      }
    }
  }

  return { sku: sku.trim(), product_name: productName.trim(), product_link: productLink.trim() };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      text,
      format,
      csv,
      items,
      records,
      snapshot_date = new Date().toISOString().slice(0, 10),
      webhook_url,
      run_source = 'base44_variant_input_builder',
      max_requests_per_crawl = 100,
    } = body;

    const rawItems = [];

    // 1. Pre-built items/records array
    if (Array.isArray(items)) {
      items.forEach(item => rawItems.push(item));
    } else if (Array.isArray(records)) {
      records.forEach(r => rawItems.push(r));

    // 2. CSV format
    } else if (format === 'csv' || csv) {
      const csvText = csv || text || '';
      const rows = parseCsv(csvText);
      rows.forEach(row => rawItems.push(mapRow(row)));

    // 3. Plain text
    } else if (text) {
      const lines = text.trim().split('\n').filter(l => l.trim());
      for (const line of lines) {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length >= 2) {
          // Check if first part looks like a URL
          const firstIsUrl = parts[0].startsWith('http');
          if (firstIsUrl) {
            // plain link line
            rawItems.push({ sku: '', product_name: '', product_link: parts[0] });
          } else {
            // sku, link, name  OR  sku, link
            rawItems.push({ sku: parts[0], product_link: parts[1], product_name: parts[2] || '' });
          }
        } else if (parts.length === 1 && parts[0].startsWith('http')) {
          rawItems.push({ sku: '', product_name: '', product_link: parts[0] });
        }
        // Auto-detect: could be CSV with headers if first line has no URL
        // handled via parseCsv branch above
      }

      // If first line looks like CSV headers (no URLs), re-parse as CSV
      const firstLine = lines[0] || '';
      const firstCols = firstLine.split(',').map(s => s.trim());
      const hasHeaders = firstCols.some(c => ['sku', 'product_name', 'product_link', 'Link sản phẩm', 'Tên sản phẩm', 'Mã sản phẩm'].includes(c));
      if (hasHeaders) {
        rawItems.length = 0;
        const rows = parseCsv(text);
        rows.forEach(row => rawItems.push(mapRow(row)));
      }
    }

    // Process & normalize
    const seen = new Set();
    const convertedItems = [];
    let skipped = 0;

    for (const raw of rawItems) {
      const link = normalizeShopeeUrl(raw.product_link || '');
      if (!link || !link.startsWith('http')) { skipped++; continue; }

      const product_id = extractProductId(link);
      const sku = raw.sku || (product_id ? `SHOPEE-${product_id}` : `SHOPEE-${Date.now()}`);
      const dedupeKey = `${sku}||${link}`;
      if (seen.has(dedupeKey)) { skipped++; continue; }
      seen.add(dedupeKey);

      const item = { sku, product_link: link };
      if (product_id) item.product_id = product_id;
      if (raw.product_name) item.product_name = raw.product_name;

      convertedItems.push(item);
    }

    const apify_input = {
      items: convertedItems,
      run_source,
      snapshot_date,
    };
    if (webhook_url) apify_input.webhook_url = webhook_url;
    if (max_requests_per_crawl) apify_input.max_requests_per_crawl = Number(max_requests_per_crawl);

    return Response.json({
      success: true,
      received: rawItems.length,
      converted: convertedItems.length,
      skipped,
      apify_input,
      apify_input_json: JSON.stringify(apify_input, null, 2),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});