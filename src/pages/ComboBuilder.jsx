import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Layers, Plus, Trash2, Package, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_COLORS = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-yellow-100 text-yellow-800',
  archived: 'bg-gray-100 text-gray-600',
};

export default function ComboBuilder() {
  const [combos, setCombos] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [comboForm, setComboForm] = useState({ combo_name: '', combo_code: '', description: '', combo_price: '', items: [] });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      base44.entities.Combo.list('-created_date', 50),
      base44.entities.Product.filter({ status: 'active' }, '-created_date', 200),
    ]);
    setCombos(c);
    setProducts(p);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const addItem = () => {
    setComboForm(f => ({ ...f, items: [...f.items, { product_id: '', sku_code: '', product_name: '', quantity: 1, unit_cost: 0 }] }));
  };

  const removeItem = (idx) => {
    setComboForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const updateItem = (idx, key, value) => {
    setComboForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [key]: value };
      if (key === 'product_id') {
        const p = products.find(p => p.id === value);
        if (p) { items[idx].sku_code = p.sku_code; items[idx].product_name = p.product_name; items[idx].unit_cost = p.cost_price || 0; }
      }
      return { ...f, items };
    });
  };

  const totalCost = comboForm.items.reduce((sum, i) => sum + (parseFloat(i.unit_cost) || 0) * (parseInt(i.quantity) || 1), 0);
  const comboPrice = parseFloat(comboForm.combo_price) || 0;
  const margin = comboPrice > 0 ? ((comboPrice - totalCost) / comboPrice * 100) : 0;

  const handleSave = async () => {
    if (!comboForm.combo_name || !comboForm.combo_price) { toast.error('Name and price required'); return; }
    setSaving(true);
    await base44.entities.Combo.create({
      ...comboForm,
      combo_price: comboPrice,
      total_cost: totalCost,
      margin_pct: margin,
      net_profit_per_combo: comboPrice - totalCost,
    });
    setShowDialog(false);
    setComboForm({ combo_name: '', combo_code: '', description: '', combo_price: '', items: [] });
    load();
    toast.success('Combo created');
    setSaving(false);
  };

  const updateStatus = async (id, status) => {
    await base44.entities.Combo.update(id, { status });
    load();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Combo Builder"
        subtitle="Bundle products together to improve AOV"
        actions={
          <Button size="sm" onClick={() => setShowDialog(true)}><Plus className="w-4 h-4 mr-1.5" />New Combo</Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
                <div className="h-5 bg-muted rounded w-32 mb-3" />
                <div className="h-4 bg-muted rounded w-full mb-2" />
                <div className="h-4 bg-muted rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : combos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Layers className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium">No combos yet</p>
            <p className="text-sm mt-1">Create your first product bundle</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {combos.map(combo => (
              <div key={combo.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-sm">{combo.combo_name}</h3>
                    {combo.combo_code && <p className="text-xs text-muted-foreground font-mono">{combo.combo_code}</p>}
                  </div>
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[combo.status])}>
                    {combo.status}
                  </span>
                </div>

                {combo.description && <p className="text-xs text-muted-foreground mb-3">{combo.description}</p>}

                <div className="space-y-1.5 mb-4">
                  {(combo.products || []).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Package className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">{p.quantity}x</span>
                      <span className="text-foreground">{p.product_name || p.sku_code}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border pt-3 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Price</p>
                    <p className="font-mono font-semibold text-sm">₫{(combo.combo_price || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Margin</p>
                    <p className={cn('font-semibold text-sm', (combo.margin_pct || 0) >= 15 ? 'text-emerald-600' : 'text-yellow-600')}>
                      {(combo.margin_pct || 0).toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="flex gap-1.5 mt-3">
                  {combo.status === 'draft' && (
                    <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => updateStatus(combo.id, 'active')}>Activate</Button>
                  )}
                  {combo.status === 'active' && (
                    <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => updateStatus(combo.id, 'paused')}>Pause</Button>
                  )}
                  {combo.status === 'paused' && (
                    <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => updateStatus(combo.id, 'active')}>Resume</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Combo Bundle</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs mb-1.5 block">Combo Name *</Label>
                <Input value={comboForm.combo_name} onChange={e => setComboForm(f => ({ ...f, combo_name: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">Combo Code</Label>
                <Input value={comboForm.combo_code} onChange={e => setComboForm(f => ({ ...f, combo_code: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs mb-1.5 block">Description</Label>
                <Input value={comboForm.description} onChange={e => setComboForm(f => ({ ...f, description: e.target.value }))} className="h-8 text-sm" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Products in Bundle</Label>
                <Button size="sm" variant="outline" onClick={addItem} className="h-7 text-xs"><Plus className="w-3 h-3 mr-1" />Add Item</Button>
              </div>
              <div className="space-y-2">
                {comboForm.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
                    <select className="flex-1 border border-input rounded px-2 py-1 text-xs bg-background"
                      value={item.product_id} onChange={e => updateItem(idx, 'product_id', e.target.value)}>
                      <option value="">Select product...</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.sku_code} — {p.product_name}</option>)}
                    </select>
                    <Input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} className="w-16 h-7 text-xs" placeholder="Qty" />
                    <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={() => removeItem(idx)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                ))}
                {comboForm.items.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">No items added yet</p>
                )}
              </div>
            </div>

            <div className="bg-muted/30 rounded-lg p-3 grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="font-mono font-semibold text-sm mt-1">₫{totalCost.toLocaleString()}</p>
              </div>
              <div className="text-center">
                <Label className="text-xs text-muted-foreground block mb-1">Combo Price (₫)</Label>
                <Input type="number" value={comboForm.combo_price} onChange={e => setComboForm(f => ({ ...f, combo_price: e.target.value }))} className="h-7 text-sm text-center font-mono" />
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Margin</p>
                <p className={cn('font-semibold text-sm mt-1', margin >= 15 ? 'text-emerald-600' : 'text-yellow-600')}>{margin.toFixed(1)}%</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Create Combo'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}