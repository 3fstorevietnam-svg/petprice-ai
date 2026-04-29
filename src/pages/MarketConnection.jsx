import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Wifi, WifiOff, CheckCircle2, AlertCircle, Clock,
  Save, Play, RefreshCw, Info, Zap
} from 'lucide-react';

const SOURCE_LABELS = {
  metric_api: 'Metric API',
  metric_csv: 'Metric CSV',
  apify: 'Apify',
  manual_import: 'Manual Import',
};

const STATUS_CONFIG = {
  pending:   { cls: 'text-yellow-600 bg-yellow-50 border-yellow-200', icon: Clock,        label: 'Pending' },
  connected: { cls: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: CheckCircle2, label: 'Connected' },
  error:     { cls: 'text-red-600 bg-red-50 border-red-200',           icon: AlertCircle,  label: 'Error' },
};

const DEFAULTS = { connection_name: '', source_type: 'metric_api', base_url: '', api_key: '', is_active: true };

export default function MarketConnection() {
  const [connections, setConnections] = useState([]);
  const [form, setForm] = useState(DEFAULTS);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    base44.entities.MarketConnection.list('-created_date', 50).then(d => { setConnections(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.connection_name) { toast.error('Connection name required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await base44.entities.MarketConnection.update(editing.id, form);
        toast.success('Connection updated');
      } else {
        await base44.entities.MarketConnection.create(form);
        toast.success('Connection created');
      }
      setForm(DEFAULTS);
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (conn) => {
    setEditing(conn);
    setForm({ connection_name: conn.connection_name, source_type: conn.source_type, base_url: conn.base_url || '', api_key: conn.api_key || '', is_active: conn.is_active !== false });
  };

  const handleCancel = () => { setEditing(null); setForm(DEFAULTS); };

  const handleTest = async (conn) => {
    setTesting(true);
    try {
      const res = await base44.functions.invoke('marketTestConnection', { connection_id: conn?.id });
      if (res.data?.success) {
        toast.success(res.data.message || 'Connection OK');
      } else {
        toast.error(res.data?.message || 'Test failed');
      }
      load();
    } catch (e) {
      toast.error('Test error: ' + e.message);
    } finally {
      setTesting(false);
    }
  };

  const handleFullSync = async (conn) => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke('marketRunFullSync', { connection_id: conn?.id });
      if (res.data?.success) {
        toast.success(`Full sync done — ${res.data.raw_rows_inserted || 0} raw rows, ${res.data.products_updated || 0} products updated`);
      } else {
        toast.error(res.data?.errors?.join('; ') || 'Sync failed');
      }
      load();
    } catch (e) {
      toast.error('Sync error: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (conn) => {
    await base44.entities.MarketConnection.delete(conn.id);
    toast.success('Deleted');
    load();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Market Connection"
        subtitle="Configure external market data sources (Metric, Apify, CSV)"
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Info Banner */}
        <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-800 space-y-0.5">
            <p className="font-semibold">Module này là Market Intelligence — không phải Shopee Sync</p>
            <p>• Dữ liệu từ Metric, Apify hoặc CSV sẽ được lưu vào bảng raw và tổng hợp vào market_summary_daily</p>
            <p>• Chỉ cập nhật các trường: market_low, market_avg, competitor_price, current_rank trên product</p>
            <p>• Không bao giờ ghi đè cost, sku_role, min_price, max_price của sản phẩm</p>
            <p>• Không tự động push lên Shopee — mọi thay đổi giá vẫn phải qua Approval Queue</p>
          </div>
        </div>

        {/* Connection Form */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-sm mb-4">{editing ? `Edit: ${editing.connection_name}` : 'Add Connection'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1.5 block">Connection Name *</Label>
              <Input value={form.connection_name} onChange={e => set('connection_name', e.target.value)} placeholder="e.g. Metric Shopee Pet" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Source Type</Label>
              <Select value={form.source_type} onValueChange={v => set('source_type', v)}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Base URL</Label>
              <Input value={form.base_url} onChange={e => set('base_url', e.target.value)} placeholder="https://api.metric.vn/v1" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">API Key / Token</Label>
              <Input value={form.api_key} onChange={e => set('api_key', e.target.value)} placeholder="••••••••" type="password" className="h-8 text-sm" />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
              <Label className="text-xs">Active</Label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="w-3.5 h-3.5" />{saving ? 'Saving...' : editing ? 'Update Connection' : 'Save Connection'}
            </Button>
            {editing && <Button size="sm" variant="outline" onClick={handleCancel}>Cancel</Button>}
          </div>
        </div>

        {/* Connection Cards */}
        <div className="space-y-3">
          <h3 className="font-semibold text-sm text-foreground">Configured Connections</h3>
          {loading ? (
            <div className="bg-card border border-border rounded-xl p-5 animate-pulse h-24" />
          ) : connections.length === 0 ? (
            <div className="bg-muted/30 border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
              <WifiOff className="w-8 h-8 mx-auto mb-2 opacity-20" />
              No connections configured yet.
            </div>
          ) : connections.map(conn => {
            const sc = STATUS_CONFIG[conn.status || 'pending'];
            const Icon = sc.icon;
            return (
              <div key={conn.id} className={cn('bg-card border rounded-xl p-4 space-y-3', conn.is_active === false && 'opacity-60')}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <Wifi className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm">{conn.connection_name}</span>
                    <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{SOURCE_LABELS[conn.source_type] || conn.source_type}</span>
                    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', sc.cls)}>
                      <Icon className="w-2.5 h-2.5" />{sc.label}
                    </span>
                    {!conn.is_active && <span className="text-[10px] text-muted-foreground italic">inactive</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleTest(conn)} disabled={testing}>
                      <Zap className="w-3 h-3" />{testing ? '...' : 'Test'}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleFullSync(conn)} disabled={syncing}>
                      <RefreshCw className={cn('w-3 h-3', syncing && 'animate-spin')} />{syncing ? 'Syncing...' : 'Full Sync'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleEdit(conn)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-600" onClick={() => handleDelete(conn)}>Delete</Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {conn.base_url && (
                    <div className="bg-muted/30 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Base URL</p>
                      <p className="truncate font-mono">{conn.base_url}</p>
                    </div>
                  )}
                  {conn.last_sync_at && (
                    <div className="bg-muted/30 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Last Sync</p>
                      <p>{new Date(conn.last_sync_at).toLocaleString('vi-VN')}</p>
                    </div>
                  )}
                  {conn.last_error && (
                    <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 sm:col-span-2">
                      <p className="text-[10px] text-red-500 font-medium uppercase tracking-wide mb-0.5">Last Error</p>
                      <p className="text-red-700">{conn.last_error}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}