import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Layers, Calculator, TrendingUp, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function calcComboMetrics({ cost, feeRate, opsFee, packingFee, fixedFee, targetMargin, comboQty, comboPrice }) {
  const qty = parseInt(comboQty) || 1;
  const totalCost = parseFloat(cost) * qty;
  const fee = parseFloat(feeRate) || 0.22;
  const ops = parseFloat(opsFee) || 3000;
  const pack = parseFloat(packingFee) || 11000;
  const fixed = parseFloat(fixedFee) || 1833;
  const totalFees = ops + pack + fixed;

  if (comboPrice) {
    const price = parseFloat(comboPrice);
    const shopFee = price * fee;
    const profit = price - totalCost - shopFee - totalFees;
    const margin = price > 0 ? (profit / price) * 100 : 0;
    return { suggestedPrice: price, profit, margin, comboQty: qty, ok: true };
  }

  // Calculate suggested price for target margin
  const margin = parseFloat(targetMargin) / 100 || 0.25;
  // price - price*fee - totalCost - totalFees = price * margin
  // price * (1 - fee - margin) = totalCost + totalFees
  const price = (totalCost + totalFees) / (1 - fee - margin);
  const shopFee = price * fee;
  const profit = price - totalCost - shopFee - totalFees;
  const actualMargin = price > 0 ? (profit / price) * 100 : 0;
  return { suggestedPrice: Math.ceil(price / 1000) * 1000, profit, margin: actualMargin, comboQty: qty, ok: profit > 0 };
}

export default function ComboBuilder() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState({});
  const [form, setForm] = useState({ cost: '', feeRate: 0.22, opsFee: 3000, packingFee: 11000, fixedFee: 1833, targetMargin: 25, comboQty: 1, comboPrice: '', role: 'core', sku: '' });
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      base44.entities.Product.filter({ status: 'active' }, '-created_date', 200),
      base44.entities.AppSettings.list(),
    ]).then(([prods, setts]) => {
      setProducts(prods);
      const m = {};
      setts.forEach(s => { m[s.setting_key] = s.setting_value_number ?? s.setting_value_text; });
      const f = { ...form };
      if (m.DEFAULT_SHOPEE_FEE_RATE) f.feeRate = m.DEFAULT_SHOPEE_FEE_RATE;
      if (m.DEFAULT_OPS_FEE) f.opsFee = m.DEFAULT_OPS_FEE;
      if (m.DEFAULT_PACKING_FEE) f.packingFee = m.DEFAULT_PACKING_FEE;
      if (m.DEFAULT_FIXED_FEE) f.fixedFee = m.DEFAULT_FIXED_FEE;
      setForm(f);
      setSettings(m);
    });
  }, []);

  const selectProduct = (id) => {
    const p = products.find(pr => pr.id === id);
    if (!p) return;
    setForm(f => ({ ...f, sku: p.sku, cost: p.cost || '', feeRate: p.shopee_fee_rate || f.feeRate, opsFee: p.ops_fee || f.opsFee, packingFee: p.packing_fee || f.packingFee, fixedFee: p.fixed_fee || f.fixedFee, role: p.sku_role || f.role }));
  };

  const calculate = () => {
    if (!form.cost) { toast.error('Nhập giá vốn để tính'); return; }
    const r = calcComboMetrics(form);
    setResult(r);
  };

  const saveAsSuggestion = async () => {
    if (!result || !form.sku) { toast.error('Chọn SKU và tính toán trước'); return; }
    setSaving(true);
    await base44.entities.AISuggestion.create({
      sku: form.sku,
      rec_date: new Date().toISOString().split('T')[0],
      current_price: products.find(p => p.sku === form.sku)?.current_price,
      suggested_action: 'GOM_COMBO',
      suggested_price: result.suggestedPrice,
      suggested_combo_qty: result.comboQty,
      ads_action: 'GIU_NGUYEN',
      reason: `Combo ${result.comboQty} units với giá ₫${result.suggestedPrice?.toLocaleString()}, margin ${result.margin?.toFixed(1)}%, lợi nhuận ₫${result.profit?.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}/đơn.`,
      confidence: 80,
      status: 'pending',
    });
    toast.success('Đã lưu thành AI Suggestion');
    setSaving(false);
  };

  const f = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="Combo Builder" subtitle="Tính toán giá bundle và gợi ý combo tối ưu" />

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Input Panel */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Calculator className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-sm">Thông số đầu vào</h2>
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">Chọn sản phẩm (tuỳ chọn)</Label>
              <Select onValueChange={selectProduct}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Chọn từ danh sách..." /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.sku} — {p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'sku', label: 'SKU', type: 'text' },
                { key: 'cost', label: 'Giá vốn 1 đơn (₫) *', type: 'number' },
                { key: 'feeRate', label: 'Tỷ lệ phí Shopee', type: 'number', step: '0.01' },
                { key: 'opsFee', label: 'Phí vận hành (₫)', type: 'number' },
                { key: 'packingFee', label: 'Phí đóng gói (₫)', type: 'number' },
                { key: 'fixedFee', label: 'Phí cố định (₫)', type: 'number' },
                { key: 'comboQty', label: 'Số lượng combo', type: 'number' },
                { key: 'targetMargin', label: 'Margin mục tiêu (%)', type: 'number' },
              ].map(({ key, label, type, step }) => (
                <div key={key}>
                  <Label className="text-xs mb-1.5 block">{label}</Label>
                  <Input type={type} step={step} value={form[key] ?? ''} onChange={e => f(key, e.target.value)} className="h-8 text-sm" />
                </div>
              ))}
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">Giá bán thực tế (để tính ngược, bỏ trống để tính theo margin mục tiêu)</Label>
              <Input type="number" value={form.comboPrice || ''} onChange={e => f('comboPrice', e.target.value)} className="h-8 text-sm" placeholder="Để trống = tính theo target margin" />
            </div>

            <div>
              <Label className="text-xs mb-1.5 block">Role SKU</Label>
              <Select value={form.role} onValueChange={v => f('role', v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="moi">Mới</SelectItem>
                  <SelectItem value="core">Core</SelectItem>
                  <SelectItem value="upsell">Upsell</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button className="w-full" onClick={calculate}>
              <Calculator className="w-4 h-4 mr-2" />Tính Toán Combo
            </Button>
          </div>

          {/* Result Panel */}
          <div className="space-y-4">
            {result ? (
              <div className={cn('bg-card border-2 rounded-xl p-5 space-y-4', result.ok && result.margin > 15 ? 'border-emerald-300 bg-emerald-50/30' : result.ok ? 'border-yellow-300 bg-yellow-50/20' : 'border-red-300 bg-red-50/20')}>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className={cn('w-4 h-4', result.margin > 15 ? 'text-emerald-600' : result.ok ? 'text-yellow-600' : 'text-red-500')} />
                  <h2 className="font-semibold text-sm">Kết quả tính toán</h2>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Số lượng combo', value: `${result.comboQty} đơn`, highlight: true },
                    { label: 'Giá đề xuất', value: `₫${result.suggestedPrice?.toLocaleString()}`, highlight: true },
                    { label: 'Lợi nhuận / đơn', value: `₫${result.profit?.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}`, color: result.profit > 0 ? 'text-emerald-600' : 'text-red-600' },
                    { label: 'Margin', value: `${result.margin?.toFixed(1)}%`, color: result.margin > 15 ? 'text-emerald-600' : result.margin > 0 ? 'text-yellow-600' : 'text-red-600' },
                  ].map(({ label, value, color, highlight }) => (
                    <div key={label} className={cn('p-3 rounded-lg', highlight ? 'bg-muted/50' : 'bg-muted/20')}>
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <p className={cn('font-bold text-lg font-mono', color || 'text-foreground')}>{value}</p>
                    </div>
                  ))}
                </div>

                <div className={cn('rounded-lg p-3 text-sm font-medium', result.margin > 20 ? 'bg-emerald-100 text-emerald-800' : result.margin > 10 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800')}>
                  {result.margin > 20
                    ? `✅ Combo này sinh lời tốt. Margin ${result.margin.toFixed(1)}% — có thể đề xuất ngay.`
                    : result.margin > 10
                    ? `⚠️ Margin thấp ${result.margin.toFixed(1)}% — chạy được nhưng cần theo dõi.`
                    : `❌ Không đạt margin mục tiêu (${result.margin.toFixed(1)}%). Cần tăng giá hoặc giảm cost.`
                  }
                </div>

                <Button className="w-full" variant="outline" onClick={saveAsSuggestion} disabled={saving || !form.sku}>
                  {saving ? 'Đang lưu...' : '💾 Lưu thành AI Suggestion'}
                </Button>
              </div>
            ) : (
              <div className="bg-card border border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center text-muted-foreground">
                <Layers className="w-10 h-10 mb-3 opacity-20" />
                <p className="font-medium text-sm">Nhập thông số và nhấn "Tính Toán"</p>
                <p className="text-xs mt-1">Kết quả sẽ hiển thị ở đây</p>
              </div>
            )}

            {/* Reference */}
            <div className="bg-muted/30 border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">💡 Hướng dẫn</p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Nhập giá vốn 1 đơn và số lượng combo để tính giá đề xuất</li>
                <li>Hoặc nhập giá bán thực tế để tính ngược profit & margin</li>
                <li>Margin mục tiêu mặc định 25%</li>
                <li>Sau khi tính, có thể lưu ngay thành AI Suggestion để duyệt</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}