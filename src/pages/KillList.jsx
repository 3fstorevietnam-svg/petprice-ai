import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skull, Plus, AlertTriangle, CheckCircle, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STATUS_COLORS = {
  recommended: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-orange-100 text-orange-800',
  liquidating: 'bg-purple-100 text-purple-800',
  killed: 'bg-gray-100 text-gray-500',
};

const KILL_REASONS = [
  { value: 'no_profit', label: 'No Profit' },
  { value: 'dead_stock', label: 'Dead Stock' },
  { value: 'supplier_discontinued', label: 'Supplier Discontinued' },
  { value: 'strategy_change', label: 'Strategy Change' },
  { value: 'high_return_rate', label: 'High Return Rate' },
  { value: 'ai_recommended', label: 'AI Recommended' },
];

export default function KillList() {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ product_id: '', kill_reason: 'no_profit', kill_date: format(new Date(), 'yyyy-MM-dd'), remaining_stock: '', avg_margin_last_30d: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [k, p] = await Promise.all([
      base44.entities.KillList.list('-created_date', 100),
      base44.entities.Product.list('-created_date', 200),
    ]);
    setItems(k);
    setProducts(p);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    const product = products.find(p => p.id === form.product_id);
    await base44.entities.KillList.create({
      ...form,
      sku_code: product?.sku_code || '',
      product_name: product?.product_name || '',
      remaining_stock: parseInt(form.remaining_stock) || 0,
      avg_margin_last_30d: parseFloat(form.avg_margin_last_30d) || 0,
    });
    if (product) await base44.entities.Product.update(form.product_id, { status: 'inactive' });
    setShowDialog(false);
    load();
    toast.success('SKU added to kill list');
    setSaving(false);
  };

  const approve = async (id) => {
    await base44.entities.KillList.update(id, { status: 'approved', approved_at: new Date().toISOString() });
    load();
    toast.success('Kill approved');
  };

  const markKilled = async (id, productId) => {
    await base44.entities.KillList.update(id, { status: 'killed' });
    if (productId) await base44.entities.Product.update(productId, { status: 'killed' });
    load();
    toast.success('SKU marked as killed');
  };

  const totalStockValue = items.reduce((sum, i) => sum + (i.stock_value || 0), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="SKU Kill List"
        subtitle={`${items.filter(i => i.status !== 'killed').length} SKUs under evaluation`}
        actions={
          <Button size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="w-4 h-4 mr-1.5" />Flag SKU for Kill
          </Button>
        }
      />

      {/* Summary */}
      <div className="flex items-center gap-6 px-6 py-3 border-b border-border bg-red-50/40 text-sm">
        {[
          { label: 'Total SKUs Flagged', value: items.length },
          { label: 'Recommended', value: items.filter(i => i.status === 'recommended').length },
          { label: 'Approved', value: items.filter(i => i.status === 'approved').length },
          { label: 'Killed', value: items.filter(i => i.status === 'killed').length },
        ].map(({ label, value }) => (
          <div key={label}>
            <span className="text-muted-foreground text-xs">{label}: </span>
            <span className="font-semibold">{value}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {loading ? (
          Array(5).fill(0).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-24" />
          ))
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Skull className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">Kill list is empty</p>
            <p className="text-sm mt-1">Flag underperforming SKUs for review</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className={cn(
              'bg-card border rounded-xl p-5',
              item.status === 'recommended' ? 'border-yellow-200' :
              item.status === 'approved' ? 'border-orange-200' :
              item.status === 'killed' ? 'border-gray-200 opacity-60' :
              'border-border'
            )}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Skull className={cn('w-4 h-4 mt-0.5 flex-shrink-0', item.status === 'killed' ? 'text-gray-400' : 'text-red-500')} />
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{item.product_name || item.sku_code}</span>
                      <span className="font-mono text-xs text-muted-foreground">{item.sku_code}</span>
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[item.status])}>
                        {item.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Reason: <span className="text-foreground font-medium">{KILL_REASONS.find(r => r.value === item.kill_reason)?.label || item.kill_reason}</span></span>
                      {item.remaining_stock !== undefined && <span>Stock: {item.remaining_stock} units</span>}
                      {item.avg_margin_last_30d !== undefined && (
                        <span className={cn('font-medium', item.avg_margin_last_30d < 0 ? 'text-red-500' : 'text-muted-foreground')}>
                          Margin 30d: {item.avg_margin_last_30d.toFixed(1)}%
                        </span>
                      )}
                      {item.kill_date && <span>Flagged: {item.kill_date}</span>}
                    </div>
                    {item.notes && <p className="text-xs text-muted-foreground mt-1">{item.notes}</p>}
                  </div>
                </div>

                <div className="flex gap-2">
                  {item.status === 'recommended' && (
                    <Button size="sm" variant="outline" className="text-xs border-orange-200 text-orange-700 hover:bg-orange-50" onClick={() => approve(item.id)}>
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />Approve Kill
                    </Button>
                  )}
                  {item.status === 'approved' && (
                    <Button size="sm" variant="destructive" className="text-xs" onClick={() => markKilled(item.id, item.product_id)}>
                      <Skull className="w-3.5 h-3.5 mr-1" />Mark Killed
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Flag SKU for Kill</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs mb-1.5 block">Product *</Label>
              <select className="w-full border border-input rounded-md px-3 py-1.5 text-sm bg-background"
                value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
                <option value="">Select product...</option>
                {products.filter(p => p.status !== 'killed').map(p => (
                  <option key={p.id} value={p.id}>{p.sku_code} — {p.product_name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Kill Reason *</Label>
              <Select value={form.kill_reason} onValueChange={v => setForm(f => ({ ...f, kill_reason: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KILL_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs mb-1.5 block">Kill Date</Label>
                <Input type="date" value={form.kill_date} onChange={e => setForm(f => ({ ...f, kill_date: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Remaining Stock</Label>
                <Input type="number" value={form.remaining_stock} onChange={e => setForm(f => ({ ...f, remaining_stock: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Avg Margin 30d (%)</Label>
                <Input type="number" value={form.avg_margin_last_30d} onChange={e => setForm(f => ({ ...f, avg_margin_last_30d: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="h-8 text-sm" placeholder="Optional reason..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleSave} disabled={saving || !form.product_id}>
              {saving ? 'Saving...' : 'Flag for Kill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}