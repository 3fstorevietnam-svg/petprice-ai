import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import FormDialog from '@/components/admin/FormDialog';
import { Plus, Search, Package, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_COLORS = { active: 'bg-emerald-100 text-emerald-800', paused: 'bg-yellow-100 text-yellow-800', killed: 'bg-red-100 text-red-700' };
const ROLE_COLORS = { moi: 'bg-purple-100 text-purple-800', core: 'bg-blue-100 text-blue-800', upsell: 'bg-orange-100 text-orange-800' };

const FIELDS = [
  { key: 'sku', label: 'SKU', required: true },
  { key: 'name', label: 'Product Name', required: true, fullWidth: true },
  { key: 'category', label: 'Category' },
  { key: 'sku_role', label: 'SKU Role', type: 'select', options: [{ value: 'moi', label: 'Mới' }, { value: 'core', label: 'Core' }, { value: 'upsell', label: 'Upsell' }] },
  { key: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'killed', label: 'Killed' }] },
  { key: 'cost', label: 'Cost (₫)', type: 'number' },
  { key: 'current_price', label: 'Current Price (₫)', type: 'number' },
  { key: 'min_price', label: 'Min Price (₫)', type: 'number' },
  { key: 'max_price', label: 'Max Price (₫)', type: 'number' },
  { key: 'shopee_fee_rate', label: 'Shopee Fee Rate', type: 'number', step: '0.01' },
  { key: 'ops_fee', label: 'Ops Fee (₫)', type: 'number' },
  { key: 'packing_fee', label: 'Packing Fee (₫)', type: 'number' },
  { key: 'fixed_fee', label: 'Fixed Fee (₫)', type: 'number' },
  { key: 'combo_qty', label: 'Combo Qty', type: 'number' },
  { key: 'notes', label: 'Notes', type: 'textarea', fullWidth: true },
];

const DEFAULTS = { sku: '', name: '', category: '', cost: 0, current_price: 0, shopee_fee_rate: 0.22, ops_fee: 3000, packing_fee: 11000, fixed_fee: 1833, sku_role: 'core', combo_qty: 1, min_price: 0, max_price: '', status: 'active', notes: '' };

function calcProfit(p) {
  const price = parseFloat(p.current_price) || 0;
  const cost = parseFloat(p.cost) || 0;
  if (!price) return null;
  return price - cost - price * parseFloat(p.shopee_fee_rate || 0.22) - parseFloat(p.ops_fee || 3000) - parseFloat(p.packing_fee || 11000) - parseFloat(p.fixed_fee || 1833);
}
function calcMargin(p) {
  const profit = calcProfit(p);
  const price = parseFloat(p.current_price) || 0;
  if (profit === null || !price) return null;
  return (profit / price) * 100;
}

function InlineEdit({ value, type = 'text', onSave, className }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const inputRef = useRef();
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  const commit = () => { setEditing(false); if (val !== value) onSave(val); };
  if (!editing) return (
    <span className={cn('cursor-pointer hover:bg-muted/60 rounded px-1 py-0.5 transition-colors', className)} onClick={() => setEditing(true)}>
      {value ?? <span className="text-muted-foreground/40 text-xs italic">—</span>}
    </span>
  );
  return (
    <Input ref={inputRef} type={type} value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      className="h-6 text-xs px-1 py-0 w-full min-w-[60px]" />
  );
}

function InlineSelect({ value, options, onSave, renderValue }) {
  return (
    <Select value={value || ''} onValueChange={v => onSave(v)}>
      <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 w-auto shadow-none focus:ring-0 [&>svg]:w-3 [&>svg]:ml-0.5">
        <SelectValue>{renderValue ? renderValue(value) : value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULTS);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      base44.entities.Product.list('-created_date', 300),
      base44.entities.AISuggestion.filter({ status: 'pending' }, '-rec_date', 300),
    ]).then(([p, s]) => { setProducts(p); setSuggestions(s); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const inlineUpdate = async (id, field, val) => {
    const numFields = ['cost', 'current_price', 'min_price', 'max_price', 'shopee_fee_rate', 'ops_fee', 'packing_fee', 'fixed_fee', 'combo_qty'];
    const payload = { [field]: numFields.includes(field) ? (parseFloat(val) || 0) : val };
    await base44.entities.Product.update(id, payload);
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...payload } : p));
    toast.success('Updated');
  };

  const openCreate = () => { setEditing(null); setForm(DEFAULTS); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...row }); setOpen(true); };
  const handleSave = async () => {
    if (!form.sku || !form.name) { toast.error('SKU and Name required'); return; }
    setSaving(true);
    const payload = { ...form, cost: parseFloat(form.cost) || 0, current_price: parseFloat(form.current_price) || 0, min_price: parseFloat(form.min_price) || 0, max_price: parseFloat(form.max_price) || undefined, shopee_fee_rate: parseFloat(form.shopee_fee_rate) || 0.22, ops_fee: parseFloat(form.ops_fee) || 3000, packing_fee: parseFloat(form.packing_fee) || 11000, fixed_fee: parseFloat(form.fixed_fee) || 1833, combo_qty: parseInt(form.combo_qty) || 1 };
    if (editing) await base44.entities.Product.update(editing.id, payload);
    else await base44.entities.Product.create(payload);
    toast.success(editing ? 'Updated' : 'Created');
    setOpen(false);
    load();
    setSaving(false);
  };
  const handleDelete = async () => { await base44.entities.Product.delete(editing.id); toast.success('Deleted'); setOpen(false); load(); };

  const suggestionMap = suggestions.reduce((acc, s) => { acc[s.sku] = s; return acc; }, {});

  const filtered = products.filter(p => {
    const s = search.toLowerCase();
    return (!s || p.sku?.toLowerCase().includes(s) || p.name?.toLowerCase().includes(s)) &&
      (statusFilter === 'all' || p.status === statusFilter);
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Products" subtitle={`${products.length} SKUs`}
        actions={<Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-1.5" />Add SKU</Button>} />

      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card/30 flex-shrink-0">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search SKU or name..." className="pl-9 h-8 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="killed">Killed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} shown • Click cell to inline edit</span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs min-w-[1400px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/80 backdrop-blur">
              {['SKU', 'Name', 'Category', 'Cost', 'Price', 'Profit', 'Margin', 'Sugg. Price', 'Role', 'Combo Qty', 'Min', 'Max', 'Status', 'Notes', '⚠'].map(h => (
                <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap text-[10px]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? Array(6).fill(0).map((_, i) => (
              <tr key={i}>
                {Array(15).fill(0).map((_, j) => <td key={j} className="px-3 py-3"><div className="h-3 bg-muted rounded animate-pulse" /></td>)}
              </tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={15} className="py-16 text-center text-muted-foreground">
                <Package className="w-8 h-8 mx-auto mb-2 opacity-20" />No products found.
              </td></tr>
            ) : filtered.map(p => {
              const profit = calcProfit(p);
              const margin = calcMargin(p);
              const isLosing = profit !== null && profit < 0;
              const sugg = suggestionMap[p.sku];
              return (
                <tr key={p.id} className={cn('hover:bg-muted/20 transition-colors', isLosing && 'bg-red-50 hover:bg-red-100/70')}>
                  <td className="px-3 py-2.5"><span className="font-mono font-semibold cursor-pointer" onClick={() => openEdit(p)}>{p.sku}</span></td>
                  <td className="px-3 py-2.5 max-w-[140px]"><span className="truncate block font-medium">{p.name}</span></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.category || '—'}</td>
                  <td className="px-3 py-2.5">
                    <InlineEdit value={p.cost} type="number" onSave={v => inlineUpdate(p.id, 'cost', v)} className="font-mono" />
                  </td>
                  <td className="px-3 py-2.5">
                    <InlineEdit value={p.current_price} type="number" onSave={v => inlineUpdate(p.id, 'current_price', v)} className="font-mono font-semibold" />
                  </td>
                  <td className="px-3 py-2.5">
                    {profit !== null ? (
                      <span className={cn('font-mono font-bold', isLosing ? 'text-red-600' : 'text-emerald-600')}>
                        ₫{profit.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {margin !== null ? (
                      <span className={cn('font-bold', margin < 0 ? 'text-red-600' : margin < 10 ? 'text-yellow-600' : 'text-emerald-600')}>
                        {margin.toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {sugg?.suggested_price ? (
                      <span className={cn('font-mono font-semibold', sugg.suggested_action === 'TANG_GIA' ? 'text-emerald-600' : sugg.suggested_action === 'GIAM_GIA' ? 'text-orange-600' : 'text-muted-foreground')}>
                        ₫{parseFloat(sugg.suggested_price).toLocaleString()}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <InlineSelect value={p.sku_role} options={[{ value: 'moi', label: 'Mới' }, { value: 'core', label: 'Core' }, { value: 'upsell', label: 'Upsell' }]}
                      onSave={v => inlineUpdate(p.id, 'sku_role', v)}
                      renderValue={v => v ? <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', ROLE_COLORS[v])}>{v}</span> : '—'} />
                  </td>
                  <td className="px-3 py-2.5">
                    <InlineEdit value={p.combo_qty} type="number" onSave={v => inlineUpdate(p.id, 'combo_qty', v)} />
                  </td>
                  <td className="px-3 py-2.5">
                    <InlineEdit value={p.min_price} type="number" onSave={v => inlineUpdate(p.id, 'min_price', v)} className="font-mono" />
                  </td>
                  <td className="px-3 py-2.5">
                    <InlineEdit value={p.max_price} type="number" onSave={v => inlineUpdate(p.id, 'max_price', v)} className="font-mono" />
                  </td>
                  <td className="px-3 py-2.5">
                    <InlineSelect value={p.status} options={[{ value: 'active', label: 'Active' }, { value: 'paused', label: 'Paused' }, { value: 'killed', label: 'Killed' }]}
                      onSave={v => inlineUpdate(p.id, 'status', v)}
                      renderValue={v => v ? <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', STATUS_COLORS[v])}>{v}</span> : '—'} />
                  </td>
                  <td className="px-3 py-2.5 max-w-[120px]">
                    <InlineEdit value={p.notes} onSave={v => inlineUpdate(p.id, 'notes', v)} className="text-muted-foreground truncate max-w-[110px] block" />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {isLosing && <AlertTriangle className="w-3.5 h-3.5 text-red-500 mx-auto" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FormDialog open={open} onOpenChange={setOpen} title="Product" fields={FIELDS} form={form}
        onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))}
        onSave={handleSave} onDelete={editing ? handleDelete : undefined} saving={saving} editing={editing} />
    </div>
  );
}