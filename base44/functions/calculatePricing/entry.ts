import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const DEFAULT_FEE_RATE = 0.22;
const FIXED_COST = 15833;

const TARGET_MARGIN = { moi: 0.02, core: 0.07, upsell: 0.13 };

function calcPricing({ price, cost, feeRate = DEFAULT_FEE_RATE, role = 'core' }) {
  const p = parseFloat(price) || 0;
  const c = parseFloat(cost) || 0;
  const fee = parseFloat(feeRate) || DEFAULT_FEE_RATE;

  const netRevenue = p * (1 - fee);
  const profit = netRevenue - c - FIXED_COST;
  const margin = p > 0 ? profit / p : 0;

  const targetMargin = TARGET_MARGIN[role] ?? TARGET_MARGIN.core;
  const suggestedPrice = (c + FIXED_COST) / (1 - fee - targetMargin);

  return {
    price: p,
    cost: c,
    fee_rate: fee,
    net_revenue: Math.round(netRevenue),
    profit: Math.round(profit),
    margin: parseFloat(margin.toFixed(4)),
    margin_pct: parseFloat((margin * 100).toFixed(2)),
    target_margin: targetMargin,
    target_margin_pct: parseFloat((targetMargin * 100).toFixed(2)),
    suggested_price: Math.ceil(suggestedPrice / 1000) * 1000,
    is_losing: profit < 0,
    fixed_cost: FIXED_COST,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { price, cost, fee_rate, role, sku } = body;

    // If SKU provided, load from DB
    if (sku) {
      const products = await base44.entities.Product.filter({ sku });
      const product = products[0];
      if (!product) return Response.json({ error: `SKU ${sku} not found` }, { status: 404 });
      const result = calcPricing({
        price: product.current_price,
        cost: product.cost,
        feeRate: product.shopee_fee_rate || DEFAULT_FEE_RATE,
        role: product.sku_role || 'core',
      });
      return Response.json({ ...result, sku: product.sku, product_name: product.name });
    }

    if (!price || !cost) return Response.json({ error: 'price and cost are required' }, { status: 400 });

    const result = calcPricing({ price, cost, feeRate: fee_rate, role });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});