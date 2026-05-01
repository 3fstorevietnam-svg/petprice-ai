import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Settings, Save, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import DedupeProductsModal from '@/components/products/DedupeProductsModal';

const KEY_LABELS = {
  DEFAULT_SHOPEE_FEE_RATE: { label: 'Tỷ lệ phí Shopee mặc định', hint: 'Ví dụ: 0.22 = 22%' },
  DEFAULT_OPS_FEE: { label: 'Phí vận hành mặc định (₫)', hint: 'Chi phí ops mỗi đơn hàng' },
  DEFAULT_PACKING_FEE: { label: 'Phí đóng gói mặc định (₫)', hint: 'Chi phí đóng gói mỗi đơn' },
  DEFAULT_FIXED_FEE: { label: 'Phí cố định mặc định (₫)', hint: 'Phí cố định mỗi đơn hàng' },
};

export default function AppSettingsPage() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [editMap, setEditMap] = useState({});
  const [newRow, setNewRow] = useState({ setting_key: '', setting_value_number: '', setting_value_text: '', note: '' });
  const [showNew, setShowNew] = useState(false);
  const [addingSaving, setAddingSaving] = useState(false);
  const [dedupeOpen, setDedupeOpen] = useState(false);

  const load = () => {
    setLoading(true);
    base44.entities.AppSettings.list('setting_key', 100).then(d => {
      setSettings(d);
      const m = {};
      d.forEach(s => { m[s.id] = { setting_value_number: s.setting_value_number ?? '', setting_value_text: s.setting_value_text ?? '', note: s.note ?? '' }; });
      setEditMap(m);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const handleChange = (id, key, val) => setEditMap(m => ({ ...m, [id]: { ...m[id], [key]: val } }));

  const handleSave = async (s) => {
    setSaving(m => ({ ...m, [s.id]: true }));
    const d = editMap[s.id] || {};
    await base44.entities.AppSettings.update(s.id, {
      setting_value_number: d.setting_value_number !== '' ? parseFloat(d.setting_value_number) : undefined,
      setting_value_text: d.setting_value_text || undefined,
      note: d.note || undefined,
    });
    toast.success(`Đã lưu "${s.setting_key}"`);
    setSaving(m => ({ ...m, [s.id]: false }));
  };

  const handleDelete = async (id, key) => {
    await base44.entities.AppSettings.delete(id);
    toast.success(`Đã xoá "${key}"`);
    load();
  };

  const handleAdd = async () => {
    if (!newRow.setting_key) { toast.error('Nhập setting key'); return; }
    setAddingSaving(true);
    await base44.entities.AppSettings.create({
      setting_key: newRow.setting_key,
      setting_value_number: newRow.setting_value_number !== '' ? parseFloat(newRow.setting_value_number) : undefined,
      setting_value_text: newRow.setting_value_text || undefined,
      note: newRow.note || undefined,
    });
    setNewRow({ setting_key: '', setting_value_number: '', setting_value_text: '', note: '' });
    setShowNew(false);
    load();
    setAddingSaving(false);
    toast.success('Đã thêm setting');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader title="App Settings" subtitle="Cấu hình toàn cục dùng cho tính toán giá"
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setDedupeOpen(true)}>
              <ShieldCheck className="w-4 h-4 mr-1.5" />Dedupe Product SKUs
            </Button>
            <Button size="sm" onClick={() => setShowNew(v => !v)}><Plus className="w-4 h-4 mr-1.5" />Thêm Setting</Button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {/* Add New Row */}
        {showNew && (
          <div className="bg-accent/30 border border-primary/20 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-primary">Thêm Setting Mới</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Setting Key *</p>
                <Input className="h-8 text-xs font-mono" value={newRow.setting_key} onChange={e => setNewRow(r => ({ ...r, setting_key: e.target.value }))} placeholder="MY_SETTING_KEY" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Giá trị số</p>
                <Input type="number" step="any" className="h-8 text-sm" value={newRow.setting_value_number} onChange={e => setNewRow(r => ({ ...r, setting_value_number: e.target.value }))} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Giá trị văn bản</p>
                <Input className="h-8 text-sm" value={newRow.setting_value_text} onChange={e => setNewRow(r => ({ ...r, setting_value_text: e.target.value }))} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Ghi chú</p>
                <Input className="h-8 text-sm" value={newRow.note} onChange={e => setNewRow(r => ({ ...r, note: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={addingSaving}>{addingSaving ? 'Đang lưu...' : 'Lưu'}</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Huỷ</Button>
            </div>
          </div>
        )}

        {loading ? (
          Array(4).fill(0).map((_, i) => <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-28" />)
        ) : settings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Settings className="w-10 h-10 mb-3 opacity-20" />
            <p className="font-medium">Không có settings</p>
          </div>
        ) : settings.map(s => {
          const meta = KEY_LABELS[s.setting_key] || {};
          const d = editMap[s.id] || {};
          return (
            <div key={s.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="font-mono font-bold text-sm text-primary">{s.setting_key}</p>
                  {meta.label && <p className="text-sm text-foreground mt-0.5">{meta.label}</p>}
                  {meta.hint && <p className="text-xs text-muted-foreground">{meta.hint}</p>}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-red-500"
                  onClick={() => handleDelete(s.id, s.setting_key)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Giá trị số</p>
                  <Input type="number" step="any" className="h-8 text-sm font-mono"
                    value={d.setting_value_number ?? ''}
                    onChange={e => handleChange(s.id, 'setting_value_number', e.target.value)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Giá trị văn bản</p>
                  <Input className="h-8 text-sm"
                    value={d.setting_value_text ?? ''}
                    onChange={e => handleChange(s.id, 'setting_value_text', e.target.value)} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Ghi chú</p>
                  <Input className="h-8 text-sm"
                    value={d.note ?? ''}
                    onChange={e => handleChange(s.id, 'note', e.target.value)} />
                </div>
              </div>

              <Button size="sm" className="gap-1.5" onClick={() => handleSave(s)} disabled={saving[s.id]}>
                <Save className="w-3.5 h-3.5" />{saving[s.id] ? 'Đang lưu...' : 'Lưu thay đổi'}
              </Button>
            </div>
          );
        })}
      </div>
      <DedupeProductsModal open={dedupeOpen} onOpenChange={setDedupeOpen} onDone={() => {}} />
    </div>
  );
}