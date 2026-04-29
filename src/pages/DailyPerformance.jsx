import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { BarChart3, Plus, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function DailyPerformance() {
  const [records, setRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ product_id: '', sku_code: '', date: format(new Date(), 'yyyy-MM-dd'), orders: '', revenue: '', cogs: '', ads_spend: '', shopee_fees: '', shipping_cost_total: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [recs, prods] = await Promise.all([
      base44.entities.DailyPerformance.filter({ date: dateFilter }, '-date', 100),
      base44.entities.Product.list('-created_date', 200),
    ]);
    setRecords(recs);
    setProducts(prods);
    setLoading(false);
  };

  useEffect(() => { load(); }, [dateFilter]);

  const handleSave = async () => {
    setSaving(true);
    const product = products.find(p => p.id === form.product_id);
    const revenue = parseFloat(form.revenue) || 0;
    const cogs = parseFloat(form.cogs) || 0;
    const fees = parseFloat(form.shopee_fees) || 0;
    const ads = parseFloat(form.ads_spend) || 0;
    const ship = parseFloat(form.shipping_cost_total) || 0;
    const gross_profit = revenue - cogs - fees - ship;
    const net_profit = gross_profit - ads;
    const margin_pct = revenue > 0 ? (net_profit / revenue) * 100 : 0;
    await base44.entities.DailyPerformance.create({
      ...form,
      sku_code: product?.sku_code || form.sku_code,
      orders: parseInt(form.orders) || 0,
      revenue, cogs, shopee_fees: fees, ads_spend: ads, shipping_cost_total: ship,
      gross_profit, net_profit, margin_pct,
    });
    setShowDialog(false);
    load();
    setSaving(false);
  };

  const totals = records.reduce((acc, r) => ({
    orders: acc.orders + (r.orders || 0),
    revenue: acc.revenue + (r.revenue || 0),
    net_profit: acc.net_profit + (r.net_profit || 0),
    ads_spend: acc.ads_spend + (r.ads_spend || 0),
  }), { orders: 0, revenue: 0, net_profit: 0, ads_spend: 0 });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Daily Performance"
        subtitle="Per-SKU performance data by date"
        actions={
          <div className="flex items-center gap-2">
            <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="h-8 text-sm w-36" />
            <Button size="sm" onClick={() => setShowDialog(true)}><Plus className="w-4 h-4 mr-1.5" />Add Record</Button>
          </div>
        }
      />

      {/* Summary Bar */}
      <div className="flex items-center gap-6 px-6 py-3 border-b border-border bg-muted/20 text-sm">
        {[
          { label: 'Orders', value: totals.orders },
          { label: 'Revenue', value: `₫${totals.revenue.toLocaleString()}` },
          { label: 'Net Profit', value: `₫${totals.net_profit.toLocaleString()}`, colored: true },
          { label: 'Ads Spend', value: `₫${totals.ads_spend.toLocaleString()}` },
        ].map(({ label, value, colored }) => (
          <div key={label}>
            <span className="text-muted-foreground text-xs">{label}: </span>
            <span className={cn('font-semibold', colored && (totals.net_profit >= 0 ? 'text-emerald-600' : 'text-red-500'))}>{value}</span>
          </div>
        ))}
        <span className="text-muted-foreground text-xs ml-auto">{records.length} SKUs tracked</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['SKU', 'Orders', 'Revenue', 'COGS', 'Fees', 'Ads', 'Gross Profit', 'Net Profit', 'Margin'].map(h => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array(6).fill(0).map((_, i) => (
                <tr key={i}>
                  {Array(9).fill(0).map((_, j) => (
                    <td key={j} className="px-5 py-4"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : records.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-16 text-center text-muted-foreground">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No performance data for this date. Add records manually or import data.
              </td></tr>
            ) : (
              records.map(r => (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs font-medium">{r.sku_code}</td>
                  <td className="px-5 py-3.5">{r.orders}</td>
                  <td className="px-5 py-3.5 font-mono text-xs">₫{(r.revenue || 0).toLocaleString()}</td>
                  <td className="px-5 py-3.5 font-mono text-xs">₫{(r.cogs || 0).toLocaleString()}</td>
                  <td className="px-5 py-3.5 font-mono text-xs">₫{(r.shopee_fees || 0).toLocaleString()}</td>
                  <td className="px-5 py-3.5 font-mono text-xs">₫{(r.ads_spend || 0).toLocaleString()}</td>
                  <td className="px-5 py-3.5 font-mono text-xs">₫{(r.gross_profit || 0).toLocaleString()}</td>
                  <td className="px-5 py-3.5">
                    <span className={cn('font-semibold font-mono text-xs', (r.net_profit || 0) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                      ₫{(r.net_profit || 0).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn('font-semibold text-xs', (r.margin_pct || 0) >= 10 ? 'text-emerald-600' : (r.margin_pct || 0) >= 0 ? 'text-yellow-600' : 'text-red-500')}>
                      {(r.margin_pct || 0).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Performance Record</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="col-span-2">
              <Label className="text-xs mb-1.5 block">Product</Label>
              <select className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-background"
                value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
                <option value="">Select product...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.sku_code} — {p.product_name}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Date</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-8 text-sm" />
            </div>
            {[
              { key: 'orders', label: 'Orders' },
              { key: 'revenue', label: 'Revenue (₫)' },
              { key: 'cogs', label: 'COGS (₫)' },
              { key: 'shopee_fees', label: 'Shopee Fees (₫)' },
              { key: 'ads_spend', label: 'Ads Spend (₫)' },
              { key: 'shipping_cost_total', label: 'Shipping Cost (₫)' },
            ].map(({ key, label }) => (
              <div key={key}>
                <Label className="text-xs mb-1.5 block">{label}</Label>
                <Input type="number" value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} className="h-8 text-sm" />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}