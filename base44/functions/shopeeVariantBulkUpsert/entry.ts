import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";

function text(value) {
  return String(value ?? "").trim();
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    if (value > 100000000) return Math.round(value / 100000);
    if (value > 1000000 && value % 100000 === 0) return Math.round(value / 100000);
    return Math.round(value);
  }

  const normalized = String(value)
    .replace(/[^\d.,-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(/,/g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCount(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;

  const raw = String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "");

  const match = raw.match(/(\d+(?:[.,]\d+)?)(k|nghin|tr|trieu|m)?/);
  if (!match) return parseNumber(value);

  const parsed = Number(match[1].replace(",", "."));
  if (!Number.isFinite(parsed)) return null;

  const unit = match[2] || "";
  if (unit === "k" || unit === "nghin") return Math.round(parsed * 1000);
  if (unit === "tr" || unit === "trieu" || unit === "m") return Math.round(parsed * 1000000);

  return Math.round(parsed);
}

function stringifyRaw(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeRow(row) {
  const rawValue = row.raw_json ?? row.raw ?? row;

  return {
    snapshot_date: text(row.snapshot_date) || new Date().toISOString().slice(0, 10),
    sku: text(row.sku),
    seed_product_link: text(row.seed_product_link || row.product_link),
    parent_product_id: text(row.parent_product_id || row.product_id),
    parent_product_name: text(row.parent_product_name || row.product_name || row.name || row.title),
    competitor_shop_name: text(row.competitor_shop_name || row.shop_name),
    competitor_shop_link: text(row.competitor_shop_link || row.shop_link),
    competitor_product_link: text(row.competitor_product_link || row.seed_product_link || row.product_link),
    competitor_product_id: text(row.competitor_product_id || row.product_id),
    variant_id: text(row.variant_id || row.model_id || row.modelId),
    variant_name: text(row.variant_name || row.name),
    variant_group_1: text(row.variant_group_1),
    variant_group_2: text(row.variant_group_2),
    variant_group_3: text(row.variant_group_3),
    normalized_weight: text(row.normalized_weight),
    normalized_volume: text(row.normalized_volume),
    normalized_pack_count: parseCount(row.normalized_pack_count),
    normalized_flavor: text(row.normalized_flavor),
    normalized_type: text(row.normalized_type),
    variant_price: parseNumber(row.variant_price ?? row.price),
    variant_original_price: parseNumber(row.variant_original_price ?? row.originalPrice),
    variant_stock: parseCount(row.variant_stock ?? row.stock),
    variant_sold_est: parseCount(row.variant_sold_est ?? row.sold),
    currency: text(row.currency) || "VND",
    image_url: text(row.image_url || row.image),
    raw_json: stringifyRaw(rawValue),
    source_type: text(row.source_type) || "apify_shopee_variant_crawl",
    synced_at: new Date().toISOString(),
  };
}

function flattenItems(items) {
  const rows = [];

  for (const item of items) {
    if (Array.isArray(item.variants)) {
      for (const variant of item.variants) {
        const parent = { ...item };
        delete parent.variants;
        rows.push({ ...parent, ...variant });
      }
    } else {
      rows.push(item);
    }
  }

  return rows;
}

async function fetchApifyDataset(datasetId) {
  const token = Deno.env.get("APIFY_TOKEN");
  if (!token) throw new Error("APIFY_TOKEN secret not set");

  const url = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true&format=json`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Apify dataset fetch failed: ${res.status} ${detail}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

function getDatasetId(body) {
  return text(
    body?.resource?.defaultDatasetId ||
      body?.eventData?.defaultDatasetId ||
      body?.defaultDatasetId ||
      body?.datasetId ||
      body?.dataset_id
  );
}

async function extractItems(body) {
  if (Array.isArray(body)) return body;

  const obj = body || {};

  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.data)) return obj.data;

  const datasetId = getDatasetId(obj);
  if (datasetId) return await fetchApifyDataset(datasetId);

  return [];
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const jobRec = await base44.asServiceRole.entities.VariantCrawlJob.create({
    job_type: "webhook_receive",
    started_at: new Date().toISOString(),
    status: "running",
    source_name: "shopeeVariantBulkUpsert",
  });

  try {
    const body = await req.json().catch(() => ({}));
    const rawItems = await extractItems(body);

    if (!rawItems.length) {
      await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
        finished_at: new Date().toISOString(),
        status: "failed",
        records_processed: 0,
        error_message: "Empty or unrecognized payload - no items found",
        request_payload: JSON.stringify(body).slice(0, 500),
      });

      return Response.json(
        {
          success: false,
          received: 0,
          inserted: 0,
          failed: 0,
          seeds_updated: 0,
          errors: ["Empty or unrecognized payload - no items found"],
        },
        { status: 400 }
      );
    }

    const flatItems = flattenItems(rawItems);
    const received = flatItems.length;

    let inserted = 0;
    let failed = 0;
    let seedsUpdated = 0;
    const errors = [];
    const succeededLinks = new Set();

    for (const row of flatItems) {
      if (!text(row.sku)) {
        failed += 1;
        errors.push(`Skipped row missing sku: ${JSON.stringify(row).slice(0, 120)}`);
        continue;
      }

      try {
        const normalized = normalizeRow(row);
        await base44.asServiceRole.entities.MarketVariantSnapshotRaw.create(normalized);
        inserted += 1;

        if (normalized.seed_product_link) {
          succeededLinks.add(normalized.seed_product_link);
        }
      } catch (error) {
        failed += 1;
        errors.push(`Row insert error sku=${text(row.sku)}: ${errorMessage(error)}`);
      }
    }

    if (succeededLinks.size > 0) {
      try {
        const seeds = await base44.asServiceRole.entities.MarketProductSeed.list("-created_date", 1000);
        const now = new Date().toISOString();

        for (const seed of seeds) {
          if (succeededLinks.has(seed.product_link)) {
            await base44.asServiceRole.entities.MarketProductSeed.update(seed.id, {
              crawl_status: "crawled",
              last_crawled_at: now,
              last_error: "",
            });
            seedsUpdated += 1;
          }
        }
      } catch (error) {
        errors.push(`Seed update error: ${errorMessage(error)}`);
      }
    }

    await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
      finished_at: new Date().toISOString(),
      status: inserted > 0 ? "success" : "failed",
      records_processed: inserted,
      response_summary: `received=${received} inserted=${inserted} failed=${failed} seeds_updated=${seedsUpdated}`,
      error_message: errors.length > 0 ? errors.slice(0, 3).join("; ") : "",
    });

    return Response.json({
      success: true,
      received,
      inserted,
      failed,
      seeds_updated: seedsUpdated,
      errors,
    });
  } catch (error) {
    await base44.asServiceRole.entities.VariantCrawlJob.update(jobRec.id, {
      finished_at: new Date().toISOString(),
      status: "failed",
      error_message: errorMessage(error),
    });

    return Response.json(
      {
        success: false,
        error: errorMessage(error),
      },
      { status: 500 }
    );
  }
});
