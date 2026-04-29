import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function calcAdsAction({ margin, adsSpend, orders7d, views7d, conversionRate, roas }) {
  const m = parseFloat(margin) || 0;
  const ads = parseFloat(adsSpend) || 0;
  const ord7 = parseInt(orders7d) || 0;
  const v7 = parseInt(views7d) || 0;
  const cvr = parseFloat(conversionRate) || 0;
  const r = parseFloat(roas) || 0;

  // Stop ads: spending but zero orders
  if (ads > 0 && ord7 === 0) {
    return { ads_action: 'NGUNG_ADS', reason: 'Đang chạy ads nhưng không có đơn hàng trong 7 ngày qua. Dừng ngay để tránh đốt ngân sách.' };
  }

  // Stop ads: losing money while spending on ads
  if (m < 0 && ads > 0) {
    return { ads_action: 'NGUNG_ADS', reason: `Margin đang âm (${(m * 100).toFixed(1)}%) nhưng vẫn đang chạy ads. Dừng ads để tránh lỗ thêm.` };
  }

  // Run ads: good ROAS + positive margin + orders present
  if (r >= 2 && m >= 0.05 && ord7 > 0) {
    return { ads_action: 'CHAY_ADS', reason: `ROAS = ${r.toFixed(2)} (≥2) và margin ${(m * 100).toFixed(1)}% (≥5%). Đây là thời điểm tốt để scale ads.` };
  }

  // Test content: high views but low conversion
  if (v7 > 1000 && cvr < 0.01) {
    return { ads_action: 'TEST_LAI_GIA_VA_CONTENT', reason: `Views 7 ngày cao (${v7.toLocaleString()}) nhưng CVR chỉ ${(cvr * 100).toFixed(2)}%. Cần test lại hình ảnh, content hoặc giá.` };
  }

  return { ads_action: 'GIU_NGUYEN', reason: 'Chưa đủ tín hiệu để thay đổi chiến lược ads. Theo dõi thêm.' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { margin, ads_spend, orders_7d, views_7d, conversion_rate, roas, sku } = body;

    if (sku) {
      const products = await base44.entities.Product.filter({ sku });
      const product = products[0];
      if (!product) return Response.json({ error: `SKU ${sku} not found` }, { status: 404 });

      const perf = await base44.entities.DailyPerformance.filter({ sku }, '-date', 7);
      const latest = perf[0] || {};

      const revenue7 = perf.reduce((s, r) => s + (r.revenue || 0), 0);
      const adsSpend7 = perf.reduce((s, r) => s + (r.ads_spend || 0), 0);
      const computedRoas = adsSpend7 > 0 ? revenue7 / adsSpend7 : 0;

      // Calculate margin from product
      const price = parseFloat(product.current_price) || 0;
      const cost = parseFloat(product.cost) || 0;
      const feeRate = parseFloat(product.shopee_fee_rate) || 0.22;
      const profit = price * (1 - feeRate) - cost - 15833;
      const computedMargin = price > 0 ? profit / price : 0;

      const result = calcAdsAction({
        margin: computedMargin,
        adsSpend: adsSpend7,
        orders7d: perf.reduce((s, r) => s + (r.orders || 0), 0),
        views7d: perf.reduce((s, r) => s + (r.views || 0), 0),
        conversionRate: latest.conversion_rate || 0,
        roas: computedRoas,
      });

      return Response.json({ ...result, sku, roas: computedRoas, margin: computedMargin, ads_spend_7d: adsSpend7 });
    }

    if (margin === undefined) return Response.json({ error: 'margin is required' }, { status: 400 });

    const result = calcAdsAction({ margin, adsSpend: ads_spend, orders7d: orders_7d, views7d: views_7d, conversionRate: conversion_rate, roas });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});