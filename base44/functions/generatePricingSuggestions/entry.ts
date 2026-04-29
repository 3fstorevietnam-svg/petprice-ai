import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_FEE_RATE = 0.22;
const FIXED_COST = 15833; // ops(3000) + packing(11000) + fixed(1833)
const TARGET_MARGIN = { moi: 0.02, core: 0.07, upsell: 0.13 };
// SKU is treated as low-price / combo candidate if cost < this threshold
const COMBO_COST_THRESHOLD = 50000;
// Only recommend GIAM_GIA if margin will remain above this floor after discount
const GIAM_GIA_MARGIN_FLOOR = 0.10;
const GIAM_GIA_DROP_RATE = 0.04;

function roundComboQty(qty) {
  if (qty <= 5) return 5;
  if (qty <= 6) return 6;
  if (qty <= 10) return 10;
  if (qty <= 20) return 20;
  return 50;
}

function calcComboQty(unitCost) {
  // Minimum qty so that fixed cost is < 30% of gross revenue at target margin
  const raw = Math.ceil(FIXED_COST / (0.3 * parseFloat(unitCost)));
  return roundComboQty(raw);
}

function fmtPrice(n) { return `₫${Math.round(n).toLocaleString('vi-VN')}`; }
function fmtPct(n) { return `${(n * 100).toFixed(1)}%`; }

function runPriceOptimizer({ product, perf7, perf30 }) {
  const price  = parseFloat(product.current_price) || 0;
  const cost   = parseFloat(product.cost) || 0;
  const feeRate = parseFloat(product.shopee_fee_rate) || DEFAULT_FEE_RATE;
  const role   = product.sku_role || 'core';
  const targetMargin = TARGET_MARGIN[role] ?? TARGET_MARGIN.core;

  // ── Current unit economics ──────────────────────────────────────────
  const netRevenue = price * (1 - feeRate);
  const profit     = netRevenue - cost - FIXED_COST;
  const margin     = price > 0 ? profit / price : 0;
  const marginPct  = margin * 100;

  // ── Performance aggregates ──────────────────────────────────────────
  const orders7d    = perf7.reduce((s, r) => s + (r.orders || 0), 0);
  const orders30d   = perf30.reduce((s, r) => s + (r.orders || 0), 0);
  const views7d     = perf7.reduce((s, r) => s + (r.views || 0), 0);
  const adsSpend7d  = perf7.reduce((s, r) => s + (r.ads_spend || 0), 0);
  const revenue7d   = perf7.reduce((s, r) => s + (r.revenue || 0), 0);
  const latestPerf  = perf7[0] || {};
  const cvr         = parseFloat(latestPerf.conversion_rate) || 0; // stored as ratio (0.008 = 0.8%)
  const cvrPct      = cvr * 100;
  const roas        = adsSpend7d > 0 ? revenue7d / adsSpend7d : 0;

  // ── Suggested prices ────────────────────────────────────────────────
  // Min price to hit target margin at single unit
  const suggestedBasePrice = Math.ceil(((cost + FIXED_COST) / (1 - feeRate - targetMargin)) / 1000) * 1000;

  // Combo metrics
  const comboQty      = calcComboQty(cost);
  const comboCost     = cost * comboQty;
  const comboPrice    = Math.ceil(((comboCost + FIXED_COST) / (1 - feeRate - targetMargin)) / 1000) * 1000;
  const comboProfit   = comboPrice * (1 - feeRate) - comboCost - FIXED_COST;
  const comboMarginPct = comboPrice > 0 ? (comboProfit / comboPrice) * 100 : 0;

  // Price after a GIAM_GIA drop — only valid if post-drop margin stays above floor
  const dropPrice         = Math.floor((price * (1 - GIAM_GIA_DROP_RATE)) / 1000) * 1000;
  const dropNetRevenue    = dropPrice * (1 - feeRate);
  const dropProfit        = dropNetRevenue - cost - FIXED_COST;
  const dropMargin        = dropPrice > 0 ? dropProfit / dropPrice : 0;
  const dropIsAcceptable  = dropMargin >= GIAM_GIA_MARGIN_FLOOR;

  // ── Decision ────────────────────────────────────────────────────────
  let suggestedAction   = 'GIU_GIA';
  let suggestedPrice    = null;
  let suggestedComboQty = null;
  let reason            = '';
  let confidence        = 60;

  // Rule 1 — Negative margin: fix economics first
  if (margin < 0) {
    if (cost < COMBO_COST_THRESHOLD && comboMarginPct > 0) {
      suggestedAction   = 'GOM_COMBO';
      suggestedPrice    = comboPrice;
      suggestedComboQty = comboQty;
      reason = `Lỗ ${fmtPct(-margin)} mỗi đơn (lợi nhuận ${fmtPrice(profit)}/đơn). Giá vốn ${fmtPrice(cost)} quá thấp để bán lẻ có lãi. Gom ${comboQty} đơn → giá combo ${fmtPrice(comboPrice)}, margin ${comboMarginPct.toFixed(1)}%.`;
      confidence = 85;
    } else {
      suggestedAction = 'TANG_GIA';
      suggestedPrice  = suggestedBasePrice;
      reason = `Lỗ ${fmtPct(-margin)} mỗi đơn (lợi nhuận ${fmtPrice(profit)}/đơn). Cần tăng giá lên ${fmtPrice(suggestedBasePrice)} để đạt mục tiêu margin ${(targetMargin * 100).toFixed(0)}% (role: ${role}).`;
      confidence = 90;
    }
  }
  // Rule 2 — Low-price SKU not yet bundled → force combo evaluation
  else if (cost < COMBO_COST_THRESHOLD && (product.combo_qty || 1) < 5 && comboMarginPct > marginPct + 3) {
    suggestedAction   = 'GOM_COMBO';
    suggestedPrice    = comboPrice;
    suggestedComboQty = comboQty;
    reason = `Giá vốn ${fmtPrice(cost)} thuộc nhóm thấp và chưa gom combo (combo_qty hiện tại: ${product.combo_qty || 1}). Gom ${comboQty} đơn → margin tăng từ ${marginPct.toFixed(1)}% lên ${comboMarginPct.toFixed(1)}%.`;
    confidence = 78;
  }
  // Rule 3 — Good demand, margin too thin → raise price
  else if (orders7d > 15 && margin < targetMargin) {
    const raiseRate = margin < 0.02 ? 0.10 : (margin < 0.05 ? 0.06 : 0.03);
    suggestedPrice  = Math.ceil((price * (1 + raiseRate)) / 1000) * 1000;
    suggestedAction = 'TANG_GIA';
    reason = `${orders7d} đơn/7 ngày cho thấy nhu cầu tốt, nhưng margin ${marginPct.toFixed(1)}% dưới mục tiêu ${(targetMargin * 100).toFixed(0)}%. Tăng ${(raiseRate * 100).toFixed(0)}% lên ${fmtPrice(suggestedPrice)} — nếu đơn không giảm > 30% trong 7 ngày, giữ giá mới.`;
    confidence = 80;
  }
  // Rule 4 — High traffic, low CVR, acceptable margin → test price drop
  else if (views7d > 800 && cvrPct < 1.0 && dropIsAcceptable) {
    suggestedAction = 'GIAM_GIA';
    suggestedPrice  = dropPrice;
    reason = `${views7d.toLocaleString()} lượt xem/7 ngày nhưng CVR chỉ ${cvrPct.toFixed(2)}% (chuẩn tốt ≥ 2%). Giảm ${(GIAM_GIA_DROP_RATE * 100).toFixed(0)}% → ${fmtPrice(dropPrice)}, margin sau giảm ${(dropMargin * 100).toFixed(1)}% vẫn trên ngưỡng an toàn 10%. Cần theo dõi CVR sau 7 ngày.`;
    confidence = 72;
  }
  // Rule 5 — High traffic, low CVR, but margin too thin to drop → test content/price
  else if (views7d > 800 && cvrPct < 1.0 && !dropIsAcceptable) {
    suggestedAction = 'GIU_GIA';
    reason = `${views7d.toLocaleString()} lượt xem/7 ngày nhưng CVR ${cvrPct.toFixed(2)}% thấp. Không giảm giá vì margin ${marginPct.toFixed(1)}% quá sát đáy. Cần test lại ảnh/nội dung để cải thiện chuyển đổi.`;
    confidence = 65;
  }
  // Rule 6 — Dead SKU: no orders in 30 days
  else if (orders30d === 0) {
    if (cost < COMBO_COST_THRESHOLD) {
      suggestedAction   = 'GOM_COMBO';
      suggestedPrice    = comboPrice;
      suggestedComboQty = comboQty;
      reason = `0 đơn hàng trong 30 ngày. Giá vốn ${fmtPrice(cost)} còn có thể gom combo ${comboQty} đơn → giá ${fmtPrice(comboPrice)}, margin ${comboMarginPct.toFixed(1)}%. Nếu combo cũng không có đơn sau 14 ngày → Kill SKU.`;
      confidence = 74;
    } else {
      suggestedAction = 'KILL_SKU';
      reason = `0 đơn hàng trong 30 ngày. Giá vốn ${fmtPrice(cost)} quá cao để gom combo có lãi. SKU đã chết — đề nghị xoá khỏi danh mục để tránh giữ vốn tồn kho.`;
      confidence = 85;
    }
  }
  // Rule 7 — Healthy SKU
  else {
    suggestedAction = 'GIU_GIA';
    reason = `SKU hoạt động ổn. Margin ${marginPct.toFixed(1)}% (mục tiêu ${(targetMargin * 100).toFixed(0)}%), ${orders7d} đơn/7 ngày, ${orders30d} đơn/30 ngày. Giữ giá ${fmtPrice(price)} — theo dõi thêm 7 ngày.`;
    confidence = 65;
  }

  // ── Ads decision ────────────────────────────────────────────────────
  let adsAction = 'GIU_NGUYEN';
  let adsReason = '';

  if (adsSpend7d > 0 && orders7d === 0) {
    adsAction = 'NGUNG_ADS';
    adsReason = `Chi ${fmtPrice(adsSpend7d)} ads/7 ngày nhưng 0 đơn hàng. ROAS = 0. Dừng ads ngay, tránh đốt ngân sách.`;
  } else if (margin < 0 && adsSpend7d > 0) {
    adsAction = 'NGUNG_ADS';
    adsReason = `Đang lỗ ${fmtPct(-margin)}/đơn và vẫn đang chạy ads ${fmtPrice(adsSpend7d)}/7 ngày. Mỗi đơn ads càng tăng lỗ thêm — dừng ngay.`;
  } else if (roas >= 3 && margin >= targetMargin && orders7d >= 5) {
    adsAction = 'CHAY_ADS';
    adsReason = `ROAS = ${roas.toFixed(1)} (≥ 3), margin ${marginPct.toFixed(1)}%, ${orders7d} đơn/7 ngày. Hiệu quả ads tốt — có thể tăng ngân sách.`;
  } else if (views7d > 800 && cvrPct < 1.0 && adsSpend7d > 0) {
    adsAction = 'TEST_LAI_GIA_VA_CONTENT';
    adsReason = `Ads đang chạy nhưng CVR chỉ ${cvrPct.toFixed(2)}% (${views7d.toLocaleString()} views). Tắt ads hiện tại, test lại giá/ảnh chính/tiêu đề trong 5 ngày rồi bật lại.`;
  } else if (adsSpend7d === 0 && orders7d > 10 && margin >= targetMargin) {
    adsAction = 'CHAY_ADS';
    adsReason = `SKU có ${orders7d} đơn/7 ngày organic và margin ${marginPct.toFixed(1)}% tốt. Thử chạy ads để scale — đặt target ROAS ≥ 3.`;
  }

  const fullReason = adsReason
    ? `${reason}\n\n[Ads] ${adsReason}`
    : reason;

  return {
    sku: product.sku,
    current_price: price,
    current_profit: Math.round(profit),
    current_margin: parseFloat(marginPct.toFixed(2)), // stored as percent (e.g. 9.91)
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

    const today = new Date().toISOString().split('T')[0];

    const products = await base44.asServiceRole.entities.Product.filter({ status: 'active' });
    if (products.length === 0) {
      return Response.json({ success: true, processed: 0, created: 0, skipped: 0 });
    }

    const allPerf = await base44.asServiceRole.entities.DailyPerformance.list('-date', 2000);
    const perfBySku = {};
    for (const r of allPerf) {
      if (!perfBySku[r.sku]) perfBySku[r.sku] = [];
      perfBySku[r.sku].push(r);
    }

    const existingToday = await base44.asServiceRole.entities.AISuggestion.filter({ rec_date: today });
    const existingSkus = new Set(existingToday.map(s => s.sku));

    let created = 0;
    let skipped = 0;
    const results = [];

    for (const product of products) {
      if (existingSkus.has(product.sku)) { skipped++; continue; }

      const perfData = (perfBySku[product.sku] || []).sort((a, b) => b.date.localeCompare(a.date));
      const perf7  = perfData.slice(0, 7);
      const perf30 = perfData.slice(0, 30);

      const s = runPriceOptimizer({ product, perf7, perf30 });

      await base44.asServiceRole.entities.AISuggestion.create({
        sku:                  s.sku,
        rec_date:             today,
        current_price:        s.current_price,
        current_profit:       s.current_profit,
        current_margin:       s.current_margin,
        suggested_action:     s.suggested_action,
        suggested_price:      s.suggested_price || undefined,
        suggested_combo_qty:  s.suggested_combo_qty || undefined,
        ads_action:           s.ads_action,
        reason:               s.reason,
        confidence:           s.confidence,
        status:               'pending',
      });

      results.push({ sku: s.sku, action: s.suggested_action });
      created++;
    }

    return Response.json({ success: true, processed: products.length, created, skipped, today, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});