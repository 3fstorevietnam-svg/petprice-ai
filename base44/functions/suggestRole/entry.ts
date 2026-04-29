import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FIXED_COST = 15833;
const DEFAULT_FEE_RATE = 0.22;

function inferRole({ price, cost, orders30d, orders7d, revenue30d }) {
  const p = parseFloat(price) || 0;
  const c = parseFloat(cost) || 0;
  const ord30 = parseInt(orders30d) || 0;
  const ord7 = parseInt(orders7d) || 0;
  const rev30 = parseFloat(revenue30d) || 0;

  const feeRate = DEFAULT_FEE_RATE;
  const netRevenue = p * (1 - feeRate);
  const profit = netRevenue - c - FIXED_COST;
  const margin = p > 0 ? profit / p : 0;

  const reasons = [];

  // Low cost items are typically combo/upsell candidates
  if (c < 25000) {
    reasons.push(`Chi phí thấp (₫${c.toLocaleString()}) — phù hợp combo hoặc upsell`);
    if (ord30 < 5) {
      return { suggested_role: 'upsell', confidence: 0.7, reasons };
    }
    return { suggested_role: 'upsell', confidence: 0.65, reasons };
  }

  // High volume + good margin = core
  if (ord30 >= 20 && margin >= 0.07) {
    reasons.push(`Đơn hàng 30 ngày cao (${ord30}) và margin tốt (${(margin * 100).toFixed(1)}%)`);
    return { suggested_role: 'core', confidence: 0.85, reasons };
  }

  // New product: few orders
  if (ord30 < 5) {
    reasons.push(`Đơn hàng 30 ngày thấp (${ord30}) — đang thử nghiệm thị trường`);
    return { suggested_role: 'moi', confidence: 0.75, reasons };
  }

  // Moderate orders but high price = upsell
  if (p >= 150000 && ord30 >= 5) {
    reasons.push(`Giá cao (₫${p.toLocaleString()}) với đơn hàng ổn định — phù hợp upsell`);
    return { suggested_role: 'upsell', confidence: 0.72, reasons };
  }

  // Default: moderate volume = core
  if (ord30 >= 10) {
    reasons.push(`Lượng đơn ổn định (${ord30}/30 ngày) — phân loại core`);
    return { suggested_role: 'core', confidence: 0.70, reasons };
  }

  // Low volume but not new = still moi
  reasons.push(`Lượng đơn thấp (${ord30}/30 ngày) — có thể đang giai đoạn thử nghiệm`);
  return { suggested_role: 'moi', confidence: 0.60, reasons };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { sku, price, cost, orders_30d, orders_7d, revenue_30d } = body;

    if (sku) {
      const products = await base44.entities.Product.filter({ sku });
      const product = products[0];
      if (!product) return Response.json({ error: `SKU ${sku} not found` }, { status: 404 });

      const perf = await base44.entities.DailyPerformance.filter({ sku }, '-date', 30);
      const orders30d = perf.reduce((s, r) => s + (r.orders || 0), 0);
      const orders7d = perf.slice(0, 7).reduce((s, r) => s + (r.orders || 0), 0);
      const revenue30d = perf.reduce((s, r) => s + (r.revenue || 0), 0);

      const result = inferRole({
        price: product.current_price,
        cost: product.cost,
        orders30d,
        orders7d,
        revenue30d,
      });

      return Response.json({
        sku,
        product_name: product.name,
        current_role: product.sku_role,
        ...result,
        orders_30d: orders30d,
        orders_7d: orders7d,
        revenue_30d: revenue30d,
      });
    }

    if (!price || !cost) return Response.json({ error: 'price and cost are required (or provide sku)' }, { status: 400 });

    const result = inferRole({ price, cost, orders30d: orders_30d, orders7d: orders_7d, revenue30d: revenue_30d });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});