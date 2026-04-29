import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Save, Plus } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_SETTINGS = [
  { key: 'shopee_fee_pct', label: 'Shopee Platform Fee %', value: '10', category: 'pricing', description: 'Default Shopee commission rate' },
  { key: 'min_net_margin_pct', label: 'Minimum Net Margin %', value: '15', category: 'pricing', description: 'Reject any price below this margin' },
  { key: 'max_price_drop_pct', label: 'Max Price Drop % per suggestion', value: '10', category: 'pricing', description: 'AI cannot suggest more than this drop' },
  { key: 'max_price_raise_pct', label: 'Max Price Raise % per suggestion', value: '15', category: 'pricing', description: 'AI cannot suggest more than this increase' },
  { key: 'dead_stock_days', label: 'Dead Stock Threshold (days)', value: '14', category: 'ai', description: 'Days with no orders to flag as dead stock' },
  { key: 'low_margin_threshold_pct', label: 'Low Margin Alert Threshold %', value: '5', category: 'alerts', description: 'Alert when margin drops below this' },
  { key: 'ads_roas_min', label: 'Minimum ROAS for Ads', value: '3', category: 'ads', description: 'Stop ads if ROAS drops below this' },
  { key: 'kill_margin_threshold_pct', label: 'Kill Margin Threshold %', value: '0', category: 'ai', description: 'Suggest KILL_SKU when margin drops below this' },
];

const CATEGORY_LABELS = {
  pricing: '💰 Pricing Rules',
  ai: '🤖 AI Behavior',
  ads: '📢 Ads Rules',
  alerts: '🔔 Alerts',
  general: '⚙️ General',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState([]);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    let data = await base44.entities.Settings.list('-created_date', 100);
    if (data.length === 0) {
      // Seed defaults
      const created = await Promise.all(DEFAULT_SETTINGS.map(s => base44.entities.Settings.create({ ...s, value_type: 'number' })));
      data = created;
    }
    setSettings(data);
    const f = {};
    data.forEach(s => { f[s.key] = s.value; });
    setForm(f);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    await Promise.all(settings.map(s => base44.entities.Settings.update(s.id, { value: form[s.key] || s.value })));
    toast.success('Settings saved');
    setSaving(false);
  };

  const grouped = settings.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Settings"
        subtitle="Configure pricing rules, AI behavior, and alert thresholds"
        actions={
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1.5" />{saving ? 'Saving...' : 'Save All'}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
              <div className="h-5 bg-muted rounded w-40 mb-4" />
              <div className="space-y-3">
                {Array(3).fill(0).map((_, j) => <div key={j} className="h-10 bg-muted rounded" />)}
              </div>
            </div>
          ))
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-muted/20">
                <h2 className="font-semibold text-sm">{CATEGORY_LABELS[category] || category}</h2>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                {items.map(s => (
                  <div key={s.id}>
                    <Label className="text-sm font-medium block mb-1">{s.label}</Label>
                    {s.description && <p className="text-xs text-muted-foreground mb-2">{s.description}</p>}
                    <Input
                      type={s.value_type === 'number' || s.value_type === 'percentage' ? 'number' : 'text'}
                      value={form[s.key] ?? s.value}
                      onChange={e => setForm(f => ({ ...f, [s.key]: e.target.value }))}
                      className="h-9 text-sm font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-amber-900">Important Principles</p>
              <ul className="text-xs text-amber-800 mt-2 space-y-1 list-disc list-inside">
                <li>AI only creates suggestions — admin must manually approve before any action</li>
                <li>AI must not try to become the cheapest seller</li>
                <li>AI must not automatically lower price just to get orders</li>
                <li>This app does not push updates directly to Shopee</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}