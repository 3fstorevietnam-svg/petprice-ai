import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_FEE_RATE = 0.22;
const FIXED_COST = 15833;
const TARGET_MARGIN = { moi: 0.02, core: 0.07, upsell: 0.13 };

function roundComboQty(qty) {
  if (qty <= 5) return 5;
  if (qty <= 6) return 6;
  if (qty <= 10) return 10;
  if (qty <= 20) return 20;
  return 50;
}

function calcComboQty(unitCost) {
  const raw = Math.ceil(FIXED_COST / (0.3 * parseFloat(unitCost)));
  return roundComboQty(raw);
}

function optimize({ product, perf7, perf30 }) {
  const price = parseFloat(product.current_price) || 0;
  const cost = parseFloat(product.cost) || 0;
  const feeRate = parseFloat(product.shopee_fee_rate) || DEFAULT_FEE_RATE;
  const role = product.sku_role || 'core';
  const targetMargin = TARGET_MARGIN[role] ?? TARGET_MARGIN.core;

  // Current metrics
  const netRevenue = price * (1 - feeRate);
  const profit = netRevenue - cost - FIXED_COST;
  const margin = price > 0 ? profit / price : 0;

  // Perf aggregates
  const orders7d = perf7.reduce((s, r) => s + (r.orders || 0), 0);
  const orders30d = perf30.reduce((s, r) => s + (r.orders || 0), 0);
  const views7d = perf7.reduce((s, r) => s + (r.views || 0), 0);
  const adsSpend7d = perf7.reduce((s, r) => s + (r.ads_spend || 0), 0);
  const revenue7d = perf7.reduce((s, r) => s + (r.revenue || 0), 0);
  const latestPerf = perf7[0] || {};
  const conversionRate = parseFloat(latestPerf.conversion_rate) || 0;
  const roas = adsSpend7d > 0 ? revenue7d / adsSpend7d : 0;

  // Suggested base price for target margin
  const suggestedBasePrice = Math.ceil(((cost + FIXED_COST) / (1 - feeRate - targetMargin)) / 1000) * 1000;

  // Combo metrics
  const comboQty = calcComboQty(cost);
  const comboCost = cost * comboQty;
  const comboPrice = Math.ceil(((comboCost + FIXED_COST) / (1 - feeRate - targetMargin)) / 1000) * 1000;
  const comboProfit = comboPrice * (1 - feeRate) - comboCost - FIXED_COST;
  const comboMargin = comboPrice > 0 ? comboProfit / comboPrice : 0;

  // === Pricing Action Decision ===
  let suggestedAction = 'GIU_GIA';
  let suggestedPrice = null;
  let suggestedComboQty = null;
  let reason = '';
  let confidence = 60;

  // Rule 1: Margin negative => TANG_GIA or GOM_COMBO
  if (margin < 0) {
    if (cost < 25000 || comboMargin > 0) {
      suggestedAction = 'GOM_COMBO';
      suggestedPrice = comboPrice;
      suggestedComboQty = comboQty;
      reason = `Margin hiện tại âm (${(margin * 100).toFixed(1)}%). Sản phẩm giá thấp phù hợp gom combo ${comboQty} đơn để đạt margin ${(comboMargin * 100).toFixed(1)}%.`;
      confidence = 80;
    } else {
      suggestedAction = 'TANG_GIA';
      suggestedPrice = suggestedBasePrice;
      reason = `Margin hiện tại âm (${(margin * 100).toFixed(1)}%). Cần tăng giá lên ₫${suggestedBasePrice.toLocaleString()} để đạt mục tiêu margin ${(targetMargin * 100).toFixed(0)}%.`;
      confidence = 85;
    }
  }
  // Rule 2: Low cost + low combo qty => GOM_COMBO
  else if (cost < 25000 && (product.combo_qty || 1) < 5) {
    suggestedAction = 'GOM_COMBO';
    suggestedPrice = comboPrice;
    suggestedComboQty = comboQty;
    reason = `Chi phí thấp (₫${cost.toLocaleString()}) và chưa gom combo. Gom ${comboQty} đơn để đạt margin tốt hơn (${(comboMargin * 100).toFixed(1)}%).`;
    confidence = 75;
  }
  // Rule 3: High orders + low margin => TANG_GIA 3-8%
  else if (orders7d > 30 && margin < 0.05) {
    const raiseRate = margin < 0.02 ? 0.08 : 0.03;
    suggestedPrice = Math.ceil((price * (1 + raiseRate)) / 1000) * 1000;
    suggestedAction = 'TANG_GIA';
    reason = `Đơn hàng 7 ngày cao (${orders7d}) nhưng margin chỉ ${(margin * 100).toFixed(1)}%. Tăng giá ${(raiseRate * 100).toFixed(0)}% lên ₫${suggestedPrice.toLocaleString()} để cải thiện lợi nhuận.`;
    confidence = 78;
  }
  // Rule 4: High views + low CVR => GIAM_GIA 3-5% or test
  else if (views7d > 1000 && conversionRate < 0.01 && margin >= 0.05) {
    const dropRate = 0.04;
    suggestedPrice = Math.floor((price * (1 - dropRate)) / 1000) * 1000;
    suggestedAction = 'GIAM_GIA';
    reason = `Views 7 ngày cao (${views7d.toLocaleString()}) nhưng CVR chỉ ${(conversionRate * 100).toFixed(2)}%. Thử giảm giá ${(dropRate * 100).toFixed(0)}% lên ₫${suggestedPrice.toLocaleString()} để cải thiện chuyển đổi.`;
    confidence = 70;
  }
  // Rule 5: No orders in 30 days => KILL_SKU or GOM_COMBO
  else if (orders30d === 0) {
    if (cost < 50000) {
      suggestedAction = 'GOM_COMBO';
      suggestedPrice = comboPrice;
      suggestedComboQty = comboQty;
      reason = `Không có đơn hàng trong 30 ngày qua. Sản phẩm giá thấp — thử gom combo ${comboQty} đơn với giá ₫${comboPrice.toLocaleString()} trước khi kill.`;
      confidence = 72;
    } else {
      suggestedAction = 'KILL_SKU';
      reason = `Không có đơn hàng trong 30 ngày qua và giá vốn cao (₫${cost.toLocaleString()}). Đây là sản phẩm chết cần xem xét loại bỏ.`;
      confidence = 80;
    }
  }
  // Healthy: holding price
  else {
    suggestedAction = 'GIU_GIA';
    reason = `SKU đang hoạt động ổn định. Margin ${(margin * 100).toFixed(1)}%, đơn 7 ngày: ${orders7d}. Giữ giá hiện tại.`;
    confidence = 65;
  }

  // === Ads Action Decision ===
  let adsAction = 'GIU_NGUYEN';
  let adsReason = '';

  if (adsSpend7d > 0 && orders7d === 0) {
    adsAction = 'NGUNG_ADS';
    adsReason = 'Đang chạy ads nhưng không có đơn hàng trong 7 ngày. Dừng ngay.';
  } else if (margin < 0 && adsSpend7d > 0) {
    adsAction = 'NGUNG_ADS';
    adsReason = `Margin âm (${(margin * 100).toFixed(1)}%) và đang chạy ads. Dừng ads để tránh lỗ thêm.`;
  } else if (roas >= 2 && margin >= 0.05 && orders7d > 0) {
    adsAction = 'CHAY_ADS';
    adsReason = `ROAS = ${roas.toFixed(2)} (≥2) và margin ${(margin * 100).toFixed(1)}% tốt. Có thể scale ads.`;
  } else if (views7d > 1000 && conversionRate < 0.01) {
    adsAction = 'TEST_LAI_GIA_VA_CONTENT';
    adsReason = `Views cao nhưng CVR thấp (${(conversionRate * 100).toFixed(2)}%). Cần test lại content và giá.`;
  } else {
    adsAction = 'GIU_NGUYEN';
    adsReason = 'Chưa đủ tín hiệu để thay đổi chiến lược ads.';
  }

  return {
    sku: product.sku,
    product_name: product.name,
    current_price: price,
    current_profit: Math.round(profit),
    current_margin: parseFloat(margin.toFixed(4)),
    current_margin_pct: parseFloat((margin * 100).toFixed(2)),
    suggested_action: suggestedAction,
    suggested_price: suggestedPrice,
    suggested_combo_qty: suggestedComboQty,
    ads_action: adsAction,
    reason: `${reason} | Ads: ${adsReason}`,
    confidence,
    orders_7d: orders7d,
    orders_30d: orders30d,
    views_7d: views7d,
    roas: roas > 0 ? parseFloat(roas.toFixed(2)) : null,
    is_losing: profit < 0,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { sku } = body;
    if (!sku) return Response.json({ error: 'sku is required' }, { status: 400 });

    const products = await base44.entities.Product.filter({ sku });
    const product = products[0];
    if (!product) return Response.json({ error: `SKU ${sku} not found` }, { status: 404 });

    const allPerf = await base44.entities.DailyPerformance.filter({ sku }, '-date', 30);
    const perf7 = allPerf.slice(0, 7);
    const perf30 = allPerf;

    const result = optimize({ product, perf7, perf30 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});