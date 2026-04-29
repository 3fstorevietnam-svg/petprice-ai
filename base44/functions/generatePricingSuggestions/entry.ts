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

function runPriceOptimizer({ product, perf7, perf30 }) {
  const price = parseFloat(product.current_price) || 0;
  const cost = parseFloat(product.cost) || 0;
  const feeRate = parseFloat(product.shopee_fee_rate) || DEFAULT_FEE_RATE;
  const role = product.sku_role || 'core';
  const targetMargin = TARGET_MARGIN[role] ?? TARGET_MARGIN.core;

  const netRevenue = price * (1 - feeRate);
  const profit = netRevenue - cost - FIXED_COST;
  const margin = price > 0 ? profit / price : 0;

  const orders7d = perf7.reduce((s, r) => s + (r.orders || 0), 0);
  const orders30d = perf30.reduce((s, r) => s + (r.orders || 0), 0);
  const views7d = perf7.reduce((s, r) => s + (r.views || 0), 0);
  const adsSpend7d = perf7.reduce((s, r) => s + (r.ads_spend || 0), 0);
  const revenue7d = perf7.reduce((s, r) => s + (r.revenue || 0), 0);
  const latestPerf = perf7[0] || {};
  const conversionRate = parseFloat(latestPerf.conversion_rate) || 0;
  const roas = adsSpend7d > 0 ? revenue7d / adsSpend7d : 0;

  const suggestedBasePrice = Math.ceil(((cost + FIXED_COST) / (1 - feeRate - targetMargin)) / 1000) * 1000;
  const comboQty = calcComboQty(cost);
  const comboCost = cost * comboQty;
  const comboPrice = Math.ceil(((comboCost + FIXED_COST) / (1 - feeRate - targetMargin)) / 1000) * 1000;
  const comboProfit = comboPrice * (1 - feeRate) - comboCost - FIXED_COST;
  const comboMargin = comboPrice > 0 ? comboProfit / comboPrice : 0;

  let suggestedAction = 'GIU_GIA';
  let suggestedPrice = null;
  let suggestedComboQty = null;
  let reason = '';
  let confidence = 60;

  if (margin < 0) {
    if (cost < 25000 || comboMargin > 0) {
      suggestedAction = 'GOM_COMBO';
      suggestedPrice = comboPrice;
      suggestedComboQty = comboQty;
      reason = `Margin âm (${(margin * 100).toFixed(1)}%). Gom combo ${comboQty} đơn → margin ${(comboMargin * 100).toFixed(1)}%.`;
      confidence = 80;
    } else {
      suggestedAction = 'TANG_GIA';
      suggestedPrice = suggestedBasePrice;
      reason = `Margin âm (${(margin * 100).toFixed(1)}%). Tăng giá lên ₫${suggestedBasePrice.toLocaleString()} để đạt ${(targetMargin * 100).toFixed(0)}% margin.`;
      confidence = 85;
    }
  } else if (cost < 25000 && (product.combo_qty || 1) < 5) {
    suggestedAction = 'GOM_COMBO';
    suggestedPrice = comboPrice;
    suggestedComboQty = comboQty;
    reason = `Chi phí thấp (₫${cost.toLocaleString()}), combo_qty < 5. Gom ${comboQty} đơn → margin ${(comboMargin * 100).toFixed(1)}%.`;
    confidence = 75;
  } else if (orders7d > 30 && margin < 0.05) {
    const raiseRate = margin < 0.02 ? 0.08 : 0.03;
    suggestedPrice = Math.ceil((price * (1 + raiseRate)) / 1000) * 1000;
    suggestedAction = 'TANG_GIA';
    reason = `Đơn 7 ngày cao (${orders7d}) nhưng margin chỉ ${(margin * 100).toFixed(1)}%. Tăng ${(raiseRate * 100).toFixed(0)}% → ₫${suggestedPrice.toLocaleString()}.`;
    confidence = 78;
  } else if (views7d > 1000 && conversionRate < 0.01 && margin >= 0.05) {
    const dropRate = 0.04;
    suggestedPrice = Math.floor((price * (1 - dropRate)) / 1000) * 1000;
    suggestedAction = 'GIAM_GIA';
    reason = `Views cao (${views7d.toLocaleString()}) nhưng CVR thấp (${(conversionRate * 100).toFixed(2)}%). Giảm 4% → ₫${suggestedPrice.toLocaleString()}.`;
    confidence = 70;
  } else if (orders30d === 0) {
    if (cost < 50000) {
      suggestedAction = 'GOM_COMBO';
      suggestedPrice = comboPrice;
      suggestedComboQty = comboQty;
      reason = `Không có đơn 30 ngày. Thử gom combo ${comboQty} đơn trước khi kill.`;
      confidence = 72;
    } else {
      suggestedAction = 'KILL_SKU';
      reason = `Không có đơn 30 ngày và vốn cao (₫${cost.toLocaleString()}). Đề nghị loại bỏ.`;
      confidence = 80;
    }
  } else {
    suggestedAction = 'GIU_GIA';
    reason = `SKU ổn định. Margin ${(margin * 100).toFixed(1)}%, đơn 7 ngày: ${orders7d}. Giữ giá.`;
    confidence = 65;
  }

  let adsAction = 'GIU_NGUYEN';
  let adsReason = '';
  if (adsSpend7d > 0 && orders7d === 0) {
    adsAction = 'NGUNG_ADS'; adsReason = 'Chạy ads không có đơn hàng.';
  } else if (margin < 0 && adsSpend7d > 0) {
    adsAction = 'NGUNG_ADS'; adsReason = 'Margin âm, đang chạy ads.';
  } else if (roas >= 2 && margin >= 0.05 && orders7d > 0) {
    adsAction = 'CHAY_ADS'; adsReason = `ROAS ${roas.toFixed(2)} tốt, nên scale.`;
  } else if (views7d > 1000 && conversionRate < 0.01) {
    adsAction = 'TEST_LAI_GIA_VA_CONTENT'; adsReason = 'Views cao CVR thấp.';
  }

  const fullReason = adsReason ? `${reason} | Ads: ${adsReason}` : reason;

  return {
    sku: product.sku,
    product_name: product.name,
    current_price: price,
    current_profit: Math.round(profit),
    current_margin: parseFloat(margin.toFixed(4)),
    suggested_action: suggestedAction,
    suggested_price: suggestedPrice,
    suggested_combo_qty: suggestedComboQty,
    ads_action: adsAction,
    reason: fullReason,
    confidence,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Only write suggestion rows — no product price updates
    const today = new Date().toISOString().split('T')[0];

    // Load all active products
    const products = await base44.asServiceRole.entities.Product.filter({ status: 'active' });
    if (products.length === 0) {
      return Response.json({ success: true, processed: 0, created: 0, skipped: 0, message: 'No active products found.' });
    }

    // Load all performance data (batch)
    const allPerf = await base44.asServiceRole.entities.DailyPerformance.list('-date', 2000);

    // Group perf by SKU
    const perfBySku = {};
    for (const r of allPerf) {
      if (!perfBySku[r.sku]) perfBySku[r.sku] = [];
      perfBySku[r.sku].push(r);
    }

    // Load existing suggestions for today (to avoid duplicates)
    const existingToday = await base44.asServiceRole.entities.AISuggestion.filter({ rec_date: today });
    const existingSkus = new Set(existingToday.map(s => s.sku));

    let created = 0;
    let skipped = 0;
    const results = [];

    for (const product of products) {
      // Skip if already has a pending suggestion today
      if (existingSkus.has(product.sku)) {
        skipped++;
        continue;
      }

      const perfData = (perfBySku[product.sku] || []).sort((a, b) => b.date.localeCompare(a.date));
      const perf7 = perfData.slice(0, 7);
      const perf30 = perfData.slice(0, 30);

      const suggestion = runPriceOptimizer({ product, perf7, perf30 });

      // Write suggestion row — status always "pending", admin must approve
      await base44.asServiceRole.entities.AISuggestion.create({
        sku: suggestion.sku,
        rec_date: today,
        current_price: suggestion.current_price,
        current_profit: suggestion.current_profit,
        current_margin: parseFloat((suggestion.current_margin * 100).toFixed(2)),
        suggested_action: suggestion.suggested_action,
        suggested_price: suggestion.suggested_price || undefined,
        suggested_combo_qty: suggestion.suggested_combo_qty || undefined,
        ads_action: suggestion.ads_action,
        reason: suggestion.reason,
        confidence: suggestion.confidence,
        status: 'pending', // ALWAYS pending — admin must approve
      });

      results.push({ sku: suggestion.sku, action: suggestion.suggested_action });
      created++;
    }

    return Response.json({
      success: true,
      processed: products.length,
      created,
      skipped,
      today,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});