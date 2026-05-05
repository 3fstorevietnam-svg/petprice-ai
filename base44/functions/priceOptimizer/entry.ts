import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_FEE_RATE = 0.22;
const FIXED_COST = 15833;
const TARGET_MARGIN = { moi: 0.02, core: 0.07, upsell: 0.13 };
const MIN_COMBO_UNIT_DISCOUNT = 0.10;
const MIN_COMPANY_MARGIN = 0.05;
const COMBO_VERSION_TAG = '[COMBO_V4_10PCT_CAP_CLEAN_PENDING]';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundUpCustomerFriendlyPrice(price) {
  const safePrice = toNumber(price);
  if (safePrice <= 0) return 0;
  const step = safePrice >= 100000 ? 1000 : 500;
  const ceiling = Math.ceil(safePrice / step) * step;
  const charmPrice = ceiling - 100;
  return charmPrice >= safePrice ? charmPrice : ceiling;
}

function suggestMinimumProfitablePrice(cost, feeRate, fixedCost, minMargin = MIN_COMPANY_MARGIN) {
  const denominator = 1 - feeRate - minMargin;
  if (denominator <= 0) return 0;
  return roundUpCustomerFriendlyPrice((cost + fixedCost) / denominator);
}

function getComboQtyCap(unitPrice) {
  return toNumber(unitPrice) > 40000 ? 12 : 24;
}

function suggestDiscountCombo(product) {
  const cost = toNumber(product?.cost);
  const currentPrice = toNumber(product?.current_price ?? product?.price);
  const currentComboQty = Math.max(1, toNumber(product?.combo_qty, 1));
  const currentUnitPrice = currentComboQty > 0 ? currentPrice / currentComboQty : currentPrice;
  const feeRate = toNumber(product?.shopee_fee_rate, DEFAULT_FEE_RATE);
  const fixedCost =
    toNumber(product?.ops_fee, 3000) +
    toNumber(product?.packing_fee, 11000) +
    toNumber(product?.fixed_fee, 1833);
  const minPrice = toNumber(product?.min_price, 0);
  const maxPrice = product?.max_price;
  const cap = getComboQtyCap(currentUnitPrice);

  function candidateFor(qty) {
    const rawPrice = suggestMinimumProfitablePrice(cost * qty, feeRate, fixedCost);
    const upper = Number(maxPrice);
    const price =
      Number.isFinite(upper) && upper >= rawPrice
        ? Math.min(Math.max(rawPrice, minPrice), upper)
        : Math.max(rawPrice, minPrice);
    const unitPrice = qty > 0 ? price / qty : price;
    const discountRate = currentUnitPrice > 0 ? (currentUnitPrice - unitPrice) / currentUnitPrice : 0;
    const profit = price * (1 - feeRate) - cost * qty - fixedCost;
    const margin = price > 0 ? profit / price : 0;

    return {
      qty,
      price,
      unitPrice,
      discountRate,
      profit,
      margin,
      cap,
      qualified:
        qty <= cap &&
        discountRate >= MIN_COMBO_UNIT_DISCOUNT &&
        margin >= MIN_COMPANY_MARGIN &&
        price > 0,
    };
  }

  const candidates = [];
  for (let qty = 2; qty <= cap; qty += 1) {
    candidates.push(candidateFor(qty));
  }

  const viable = candidates.filter((candidate) => candidate.qualified);
  if (viable.length > 0) {
    viable.sort((a, b) => a.qty - b.qty || a.price - b.price);
    return viable[0];
  }

  return null;
}

function fmtPrice(n) {
  return `₫${Math.round(n).toLocaleString('vi-VN')}`;
}

function fmtPct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function optimize({ product, perf7, perf30 }) {
  const price = toNumber(product.current_price ?? product.price);
  const cost = toNumber(product.cost);
  const feeRate = toNumber(product.shopee_fee_rate, DEFAULT_FEE_RATE);
  const role = product.sku_role || 'core';
  const targetMargin = TARGET_MARGIN[role] ?? TARGET_MARGIN.core;
  const currentComboQty = Math.max(1, toNumber(product.combo_qty, 1));

  const profit = price * (1 - feeRate) - cost * currentComboQty - FIXED_COST;
  const margin = price > 0 ? profit / price : 0;
  const orders7d = perf7.reduce((s, r) => s + toNumber(r.orders), 0);
  const orders30d = perf30.reduce((s, r) => s + toNumber(r.orders), 0);
  const views7d = perf7.reduce((s, r) => s + toNumber(r.views), 0);
  const adsSpend7d = perf7.reduce((s, r) => s + toNumber(r.ads_spend), 0);
  const revenue7d = perf7.reduce((s, r) => s + toNumber(r.revenue), 0);
  const roas = adsSpend7d > 0 ? revenue7d / adsSpend7d : 0;
  const latestPerf = perf7[0] || {};
  const conversionRate = toNumber(latestPerf.conversion_rate);
  const comboBest = suggestDiscountCombo(product);
  const suggestedBasePrice = roundUpCustomerFriendlyPrice(
    (cost * currentComboQty + FIXED_COST) / (1 - feeRate - targetMargin)
  );

  let suggestedAction = 'GIU_GIA';
  let suggestedPrice = null;
  let suggestedComboQty = null;
  let reason = `SKU ổn định. Margin ${(margin * 100).toFixed(1)}%, ${orders7d} đơn/7 ngày.`;
  let confidence = 65;

  if (margin < 0) {
    if (comboBest?.qualified) {
      suggestedAction = 'GOM_COMBO';
      suggestedPrice = comboBest.price;
      suggestedComboQty = comboBest.qty;
      reason = `${COMBO_VERSION_TAG} Lỗ ${fmtPct(-margin)} mỗi đơn (${fmtPrice(profit)}/đơn). Gom ${comboBest.qty} sản phẩm -> giá combo ${fmtPrice(comboBest.price)} (đơn giá ${fmtPrice(comboBest.unitPrice)}, giảm ${fmtPct(comboBest.discountRate)}). Margin combo ${fmtPct(comboBest.margin)} >= 5%, giới hạn ${comboBest.cap}.`;
      confidence = 88;
    } else {
      suggestedAction = 'TANG_GIA';
      suggestedPrice = suggestedBasePrice;
      reason = `${COMBO_VERSION_TAG} Lỗ ${fmtPct(-margin)} mỗi đơn. Không có combo đạt giảm >=10%, margin >=5%, cap 12/24. Cần tăng giá lên ${fmtPrice(suggestedBasePrice)}.`;
      confidence = 90;
    }
  } else if (comboBest?.qualified) {
    suggestedAction = 'GOM_COMBO';
    suggestedPrice = comboBest.price;
    suggestedComboQty = comboBest.qty;
    reason = `${COMBO_VERSION_TAG} Gom ${comboBest.qty} sản phẩm -> giá combo ${fmtPrice(comboBest.price)} (đơn giá ${fmtPrice(comboBest.unitPrice)}, giảm ${fmtPct(comboBest.discountRate)}). Margin combo ${fmtPct(comboBest.margin)} >= 5%, giới hạn ${comboBest.cap}.`;
    confidence = 84;
  } else if (orders7d > 30 && margin < targetMargin) {
    suggestedAction = 'TANG_GIA';
    suggestedPrice = roundUpCustomerFriendlyPrice(price * 1.05);
    reason = `${orders7d} đơn/7 ngày nhưng margin ${(margin * 100).toFixed(1)}% dưới mục tiêu. Tăng giá lên ${fmtPrice(suggestedPrice)}.`;
    confidence = 78;
  } else if (views7d > 1000 && conversionRate < 0.01 && margin >= 0.10) {
    suggestedAction = 'GIAM_GIA';
    suggestedPrice = Math.floor((price * 0.96) / 1000) * 1000;
    reason = `Views cao nhưng CVR thấp. Test giảm nhẹ về ${fmtPrice(suggestedPrice)}.`;
    confidence = 70;
  } else if (orders30d === 0) {
    suggestedAction = comboBest?.qualified ? 'GOM_COMBO' : 'KILL_SKU';
    suggestedPrice = comboBest?.qualified ? comboBest.price : null;
    suggestedComboQty = comboBest?.qualified ? comboBest.qty : null;
    reason = comboBest?.qualified
      ? `${COMBO_VERSION_TAG} 0 đơn/30 ngày. Thử combo ${comboBest.qty}, đơn giá giảm ${fmtPct(comboBest.discountRate)} trước khi kill.`
      : `${COMBO_VERSION_TAG} 0 đơn/30 ngày và không có combo đạt rule 10%/5%/cap. Đề nghị kill SKU.`;
    confidence = comboBest?.qualified ? 74 : 85;
  }

  let adsAction = 'GIU_NGUYEN';
  if (adsSpend7d > 0 && orders7d === 0) {
    adsAction = 'NGUNG_ADS';
  } else if (roas >= 3 && margin >= targetMargin && orders7d >= 5) {
    adsAction = 'CHAY_ADS';
  } else if (views7d > 1000 && conversionRate < 0.01 && adsSpend7d > 0) {
    adsAction = 'TEST_LAI_GIA_VA_CONTENT';
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
    reason,
    confidence,
    orders_7d: orders7d,
    orders_30d: orders30d,
    views_7d: views7d,
    roas: roas > 0 ? parseFloat(roas.toFixed(2)) : null,
    is_losing: profit < 0,
    version: COMBO_VERSION_TAG,
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
    const result = optimize({ product, perf7: allPerf.slice(0, 7), perf30: allPerf });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
