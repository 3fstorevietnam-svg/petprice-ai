import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import FormDialog from '@/components/admin/FormDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, BarChart3, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

const DEFAULTS = { sku: '', date: format(new Date(), 'yyyy-MM-dd'), views: 0, clicks: 0, orders: 0, revenue: 0, ads_spend: 0, units_sold: 0, conversion_rate: 0, current_rank: 0, competitor_price: 0, orders_7d: 0, orders_30d: 0, views_7d: 0 };

const FIELDS = [
  { key: 'sku', label: 'SKU', required: true },
  { key: 'date', label: 'Date', type: 'date', required: true },
  { key: 'orders', label: 'Orders', type: 'number' },
  { key: 'revenue', label: 'Revenue (₫)', type: 'number' },
  { key: 'units_sold', label: 'Units Sold', type: 'number' },
  { key: 'ads_spend', label: 'Ads Spend (₫)', type: 'number' },
  { key: 'views', label: 'Views', type: 'number' },
  { key: 'clicks', label: 'Clicks', type: 'number' },
  { key: 'conversion_rate', label: 'CVR (%)', type: 'number', step: '0.01' },
  { key: 'current_rank', label: 'Current Rank', type: 'number' },
  { key: 'competitor_price', label: 'Competitor Price (₫)', type: 'number' },
  { key: 'orders_7d', label: 'Orders 7d', type: 'number' },
  { key: 'orders_30d', label: 'Orders 30d', type: 'number' },
  { key: 'views_7d', label: 'Views 7d', type: 'number' },
];

export default function DailyPerformance() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');
  const [skuSearch, setSkuSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULTS);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    base44.entities.DailyPerformance.list('-date', 500).then(d => { setRecords(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ ...DEFAULTS, date: dateFilter || format(new Date(), 'yyyy-MM-dd') }); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...row }); setOpen(true); };
  const onChange = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.sku || !form.date) { toast.error('SKU and Date required'); return; }
    setSaving(true);
    const num = (v) => parseFloat(v) || 0;
    const payload = { ...form, views: num(form.views), clicks: num(form.clicks), orders: num(form.orders), revenue: num(form.revenue), ads_spend: num(form.ads_spend), units_sold: num(form.units_sold), conversion_rate: num(form.conversion_rate), current_rank: num(form.current_rank), competitor_price: num(form.competitor_price), orders_7d: num(form.orders_7d), orders_30d: num(form.orders_30d), views_7d: num(form.views_7d) };
    if (editing) await base44.entities.DailyPerformance.update(editing.id, payload);
    else await base44.entities.DailyPerformance.create(payload);
    toast.success('Record saved');
    setOpen(false);
    load();
    setSaving(false);
  };

  const handleDelete = async () => { await base44.entities.DailyPerformance.delete(editing.id); toast.success('Deleted'); setOpen(false); load(); };

  const filtered = records.filter(r =>
    (!dateFilter || r.date === dateFilter) &&
    (!skuSearch || r.sku?.toLowerCase().includes(skuSearch.toLowerCase()))
  );

  const totals = filtered.reduce((a, r) => ({
    orders: a.orders + (r.orders || 0),
    revenue: a.revenue + (r.revenue || 0),
    ads_spend: a.ads_spend + (r.ads_spend || 0),
    units_sold: a.units_sold + (r.units_sold || 0),
  }), { orders: 0, revenue: 0, ads_spend: 0, units_sold: 0 });

  const COLS = [
    { key: 'sku', label: 'SKU', render: v => <span className="font-mono text-xs font-semibold">{v}</span> },
    { key: 'date', label: 'Date', render: v => <span className="text-xs">{v}</span> },
    { key: 'orders', label: 'Orders', render: v => <span className="font-bold text-sm">{v || 0}</span> },
    { key: 'revenue', label: 'Revenue', render: v => <span className="font-mono text-xs">₫{(v || 0).toLocaleString()}</span> },
    { key: 'ads_spend', label: 'Ads Spend', render: v => <span className="font-mono text-xs text-orange-600">₫{(v || 0).toLocaleString()}</span> },
    { key: 'units_sold', label: 'Units', render: v => <span className="text-xs">{v || 0}</span> },
    { key: 'views', label: 'Views', render: v => <span className="text-xs">{(v || 0).toLocaleString()}</span> },
    { key: 'clicks', label: 'Clicks', render: v => <span className="text-xs">{(v || 0).toLocaleString()}</span> },
    { key: 'conversion_rate', label: 'CVR', render: v => {
      const pct = (parseFloat(v) || 0) * 100;
      return <span className={cn('text-xs font-semibold', pct >= 3 ? 'text-emerald-600' : pct >= 1 ? 'text-yellow-600' : 'text-red-500')}>{pct.toFixed(2)}%</span>;
    }},
    { key: 'current_rank', label: 'Rank', render: v => <span className={cn('text-xs font-medium', (v || 0) <= 10 && (v || 0) > 0 ? 'text-emerald-600 font-bold' : '')}>{v || '—'}</span> },
    { key: 'competitor_price', label: 'Comp. Price', render: v => v ? <span className="font-mono text-xs text-muted-foreground">₫{parseFloat(v).toLocaleString()}</span> : '—' },
    { key: 'orders_7d', label: '7d Orders', render: v => <span className="text-xs font-medium">{v || 0}</span> },
    { key: 'orders_30d', label: '30d Orders', render: v => <span className="text-xs font-medium">{v || 0}</span> },
    { key: 'views_7d', label: '7d Views', render: v => <span className="text-xs">{(v || 0).toLocaleString()}</span> },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Daily Performance" subtitle="Per-SKU daily data"
        actions={<Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />Add Record</Button>} />

      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card/30 flex-shrink-0 flex-wrap">
        <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="h-8 text-sm w-36" />
        <div className="relative w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="SKU..." className="pl-9 h-8 text-sm" value={skuSearch} onChange={e => setSkuSearch(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setDateFilter(''); setSkuSearch(''); }}>Show All</Button>
        <div className="ml-auto flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">Orders: <b className="text-foreground">{totals.orders}</b></span>
          <span className="text-muted-foreground">Revenue: <b className="text-foreground font-mono">₫{totals.revenue.toLocaleString()}</b></span>
          <span className="text-muted-foreground">Ads: <b className="text-orange-600 font-mono">₫{totals.ads_spend.toLocaleString()}</b></span>
          <span className="text-muted-foreground">Units: <b className="text-foreground">{totals.units_sold}</b></span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs min-w-[1200px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/80 backdrop-blur">
              {COLS.map(c => <th key={c.key} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{c.label}</th>)}
              <th className="px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? Array(6).fill(0).map((_, i) => (
              <tr key={i}>{[...Array(COLS.length + 1)].map((_, j) => <td key={j} className="px-3 py-3"><div className="h-3 bg-muted rounded animate-pulse" /></td>)}</tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={COLS.length + 1} className="py-16 text-center text-muted-foreground">
                <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-20" />No records for this filter.
              </td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                {COLS.map(c => <td key={c.key} className="px-3 py-2.5">{c.render ? c.render(r[c.key], r) : (r[c.key] ?? '—')}</td>)}
                <td className="px-3 py-2.5">
                  <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => openEdit(r)}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FormDialog open={open} onOpenChange={setOpen} title="Performance Record" fields={FIELDS} form={form} onChange={onChange} onSave={handleSave} onDelete={editing ? handleDelete : undefined} saving={saving} editing={editing} />
    </div>
  );
}