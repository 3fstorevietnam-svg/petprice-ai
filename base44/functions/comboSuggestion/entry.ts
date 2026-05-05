import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_FEE_RATE = 0.22;
const DEFAULT_OPS_FEE = 3000;
const DEFAULT_PACKING_FEE = 11000;
const DEFAULT_FIXED_FEE = 1833;
const MIN_COMPANY_MARGIN = 0.05;
const MIN_COMBO_UNIT_DISCOUNT = 0.10;

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

function getComboQtyCap(unitPrice) {
  return toNumber(unitPrice) > 40000 ? 12 : 24;
}

function suggestMinimumProfitablePrice(cost, feeRate, fixedCost, minMargin = MIN_COMPANY_MARGIN) {
  const denominator = 1 - feeRate - minMargin;
  if (denominator <= 0) return 0;
  return roundUpCustomerFriendlyPrice((cost + fixedCost) / denominator);
}

function suggestDiscountCombo(product) {
  const cost = toNumber(product?.cost ?? product?.unit_cost);
  const currentPrice = toNumber(product?.current_price ?? product?.price);
  const currentComboQty = Math.max(1, toNumber(product?.combo_qty, 1));
  const currentUnitPrice = currentComboQty > 0 ? currentPrice / currentComboQty : currentPrice;
  const feeRate = toNumber(product?.shopee_fee_rate ?? product?.fee_rate, DEFAULT_FEE_RATE);
  const fixedCost =
    toNumber(product?.ops_fee, DEFAULT_OPS_FEE) +
    toNumber(product?.packing_fee, DEFAULT_PACKING_FEE) +
    toNumber(product?.fixed_fee, DEFAULT_FIXED_FEE);
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

  return candidates
    .slice()
    .sort((a, b) => b.discountRate - a.discountRate || b.margin - a.margin)[0] || null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { sku } = body;

    let product = body;
    if (sku) {
      const products = await base44.entities.Product.filter({ sku });
      product = products[0];
      if (!product) return Response.json({ error: `SKU ${sku} not found` }, { status: 404 });
    }

    const combo = suggestDiscountCombo(product);
    if (!combo) {
      return Response.json({ error: 'Không đủ dữ liệu để tính combo' }, { status: 400 });
    }

    return Response.json({
      sku: product?.sku || sku || '',
      product_name: product?.name || '',
      suggested_combo_qty: combo.qty,
      suggested_price: combo.price,
      suggested_combo_price: combo.price,
      unit_price_after_combo: combo.unitPrice,
      discount_rate: combo.discountRate,
      combo_qty_cap: combo.cap,
      profit_per_order: Math.round(combo.profit),
      margin: combo.margin,
      margin_pct: parseFloat((combo.margin * 100).toFixed(2)),
      is_profitable: combo.margin >= MIN_COMPANY_MARGIN,
      qualified: combo.qualified,
      strategy: combo.qualified
        ? 'GOM_COMBO_GIAM_DON_GIA_TOI_THIEU_10PT'
        : 'KHONG_DU_DIEU_KIEN_GIAM_10PT_VA_MARGIN_5PT',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
