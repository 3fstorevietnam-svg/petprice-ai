import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_FEE_RATE = 0.22;
const FIXED_COST = 15833;

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

function calcComboMetrics({ unitCost, comboQty, comboPrice, feeRate = DEFAULT_FEE_RATE, targetMargin = 0.07 }) {
  const cost = parseFloat(unitCost) || 0;
  const qty = parseInt(comboQty) || calcComboQty(cost);
  const fee = parseFloat(feeRate) || DEFAULT_FEE_RATE;
  const comboCost = cost * qty;

  let price;
  if (comboPrice) {
    price = parseFloat(comboPrice);
  } else {
    // Suggested price for target margin
    price = Math.ceil(((comboCost + FIXED_COST) / (1 - fee - parseFloat(targetMargin))) / 1000) * 1000;
  }

  const comboProfit = price * (1 - fee) - comboCost - FIXED_COST;
  const comboMargin = price > 0 ? comboProfit / price : 0;

  return {
    unit_cost: cost,
    combo_qty: qty,
    combo_cost: Math.round(comboCost),
    suggested_combo_price: Math.ceil(price / 1000) * 1000,
    profit_per_order: Math.round(comboProfit),
    margin: parseFloat(comboMargin.toFixed(4)),
    margin_pct: parseFloat((comboMargin * 100).toFixed(2)),
    fixed_cost: FIXED_COST,
    fee_rate: fee,
    is_profitable: comboProfit > 0,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { unit_cost, combo_qty, combo_price, fee_rate, target_margin, sku } = body;

    if (sku) {
      const products = await base44.entities.Product.filter({ sku });
      const product = products[0];
      if (!product) return Response.json({ error: `SKU ${sku} not found` }, { status: 404 });

      const result = calcComboMetrics({
        unitCost: product.cost,
        comboQty: combo_qty || null, // always recalculate unless explicitly passed
        comboPrice: combo_price,
        feeRate: product.shopee_fee_rate || DEFAULT_FEE_RATE,
        targetMargin: target_margin || 0.07,
      });
      return Response.json({ ...result, sku: product.sku, product_name: product.name });
    }

    if (!unit_cost) return Response.json({ error: 'unit_cost is required' }, { status: 400 });

    const result = calcComboMetrics({ unitCost: unit_cost, comboQty: combo_qty, comboPrice: combo_price, feeRate: fee_rate, targetMargin: target_margin });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});