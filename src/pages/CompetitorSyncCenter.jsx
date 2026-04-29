import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  RefreshCw, Play, Download, CheckCircle2, AlertCircle,
  Clock, Database, BarChart3, Eye, Upload, Search, Globe
} from 'lucide-react';

const JOB_STATUS = {
  running: { cls: 'bg-blue-100 text-blue-700',    label: 'Running' },
  success: { cls: 'bg-emerald-100 text-emerald-700', label: 'Success' },
  failed:  { cls: 'bg-red-100 text-red-700',       label: 'Failed' },
};

const RANK_BUCKET_COLORS = {
  TOP_10:     'text-emerald-700 font-bold',
  TOP_20:     'text-emerald-600',
  TOP_50:     'text-yellow-600',
  OUTSIDE_50: 'text-muted-foreground',
};

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }); } catch { return iso; }
}

function SummaryCard({ label, value, icon: Icon, sub, color }) {
  return (
    <div className={cn('bg-card border rounded-xl p-4 flex items-center gap-3', color || 'border-border')}>
      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-bold text-foreground text-lg leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/20">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function CompetitorSyncCenter() {
  const [jobs, setJobs] = useState([]);
  const [rawSnaps, setRawSnaps] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState('');
  const [skuFilter, setSkuFilter] = useState('');
  const [csvText, setCsvText] = useState('');
  const [showCsvImport, setShowCsvImport] = useState(false);

  // Watchlist form
  const [wlForm, setWlForm] = useState({ sku: '', keyword: '', tracked_shop_name: '', tracked_product_name: '', tracked_product_url: '', is_active: true });
  const [savingWl, setSavingWl] = useState(false);

  const load = async () => {
    setLoading(true);
    const [j, r, s, w] = await Promise.all([
      base44.entities.MarketSyncJob.list('-started_at', 30),
      base44.entities.MarketPriceSnapshotRaw.list('-snapshot_date', 200),
      base44.entities.MarketSummaryDaily.list('-summary_date', 100),
      base44.entities.CompetitorWatchlist.list('-created_date', 100),
    ]);
    setJobs(j);
    setRawSnaps(r);
    setSummaries(s);
    setWatchlist(w);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runAction = async (key, fn, payload = {}) => {
    setSyncing(key);
    try {
      const res = await base44.functions.invoke(fn, payload);
      const d = res.data || {};
      if (d.success === false || d.error) {
        toast.error(d.error || d.errors?.join('; ') || 'Failed');
      } else {
        const msg = fn === 'marketSyncRawData'
          ? `Raw sync done — ${d.inserted || 0} rows ingested`
          : fn === 'marketTransformSummary'
          ? `Transform done — ${d.summaries_created || 0} summaries, ${d.products_updated || 0} products`
          : fn === 'marketRunFullSync'
          ? `Full sync done — ${d.raw_rows_inserted || 0} raw, ${d.products_updated || 0} products updated`
          : fn === 'marketImportCsv'
          ? `CSV import done — ${d.inserted || 0} rows`
          : 'Done';
        toast.success(msg);
      }
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSyncing('');
    }
  };

  const handleCsvImport = () => {
    if (!csvText.trim()) { toast.error('Paste CSV text first'); return; }
    runAction('csv', 'marketImportCsv', { csv_text: csvText });
    setCsvText('');
    setShowCsvImport(false);
  };

  const handleSaveWatchlist = async () => {
    if (!wlForm.sku) { toast.error('SKU required'); return; }
    setSavingWl(true);
    await base44.entities.CompetitorWatchlist.create({ ...wlForm });
    toast.success('Watchlist entry added');
    setWlForm({ sku: '', keyword: '', tracked_shop_name: '', tracked_product_name: '', tracked_product_url: '', is_active: true });
    setSavingWl(false);
    load();
  };

  const handleDeleteWl = async (id) => {
    await base44.entities.CompetitorWatchlist.delete(id);
    toast.success('Removed');
    load();
  };

  const filteredRaw = rawSnaps.filter(r => !skuFilter || r.sku?.toLowerCase().includes(skuFilter.toLowerCase()));
  const filteredSum = summaries.filter(s => !skuFilter || s.sku?.toLowerCase().includes(skuFilter.toLowerCase()));

  // Summary stats
  const today = new Date().toISOString().split('T')[0];
  const rawToday = rawSnaps.filter(r => r.snapshot_date === today).length;
  const lastJob = jobs[0];
  const lastRawJob = jobs.find(j => j.job_type === 'market_snapshot');
  const lastTransformJob = jobs.find(j => j.job_type === 'transform_market');
  const skusSummarized = new Set(summaries.map(s => s.sku)).size;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Competitor Sync Center"
        subtitle="Market intelligence — raw ingestion, transformation, and audit"
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => runAction('raw', 'marketSyncRawData')} disabled={!!syncing} className="gap-1.5">
            <RefreshCw className={cn('w-3.5 h-3.5', syncing === 'raw' && 'animate-spin')} />
            Sync Raw Market Data
          </Button>
          <Button size="sm" variant="outline" onClick={() => runAction('transform', 'marketTransformSummary')} disabled={!!syncing} className="gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" />
            Transform Summary
          </Button>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={() => runAction('full', 'marketRunFullSync')} disabled={!!syncing}>
            <Play className={cn('w-3.5 h-3.5', syncing === 'full' && 'animate-spin')} />
            {syncing === 'full' ? 'Running Full Sync...' : 'Run Full Market Sync'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowCsvImport(v => !v)} className="gap-1.5">
            <Upload className="w-3.5 h-3.5" />Import CSV
          </Button>
        </div>

        {/* CSV Import Panel */}
        {showCsvImport && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h4 className="text-sm font-semibold">CSV Import</h4>
            <p className="text-xs text-muted-foreground">Paste CSV with headers: sku, keyword, competitor_shop_name, competitor_product_name, competitor_price, rank_position, estimated_units_sold, snapshot_date</p>
            <Textarea value={csvText} onChange={e => setCsvText(e.target.value)} className="font-mono text-xs h-32 resize-none" placeholder="sku,keyword,competitor_shop_name,competitor_price,rank_position&#10;CAT.0010.010,cat litter 10L,Shop ABC,127000,7" />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCsvImport} disabled={syncing === 'csv'} className="gap-1.5">
                <Upload className="w-3.5 h-3.5" />{syncing === 'csv' ? 'Importing...' : 'Import'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCsvImport(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <SummaryCard label="Last Raw Sync" icon={Clock} value={lastRawJob ? fmtDate(lastRawJob.finished_at) : '—'} sub={lastRawJob?.status} />
          <SummaryCard label="Last Transform" icon={BarChart3} value={lastTransformJob ? fmtDate(lastTransformJob.finished_at) : '—'} sub={lastTransformJob?.status} />
          <SummaryCard label="Raw Rows Today" icon={Database} value={rawToday} />
          <SummaryCard label="SKUs Summarized" icon={Globe} value={skusSummarized} />
          <SummaryCard label="Last Error" icon={AlertCircle} value={lastJob?.error_message ? '⚠ Error' : '✓ Clean'} sub={lastJob?.error_message?.slice(0, 40)} color={lastJob?.error_message ? 'border-red-200' : 'border-emerald-200'} />
        </div>

        {/* SKU filter */}
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input placeholder="Filter by SKU..." className="h-8 text-sm max-w-xs" value={skuFilter} onChange={e => setSkuFilter(e.target.value)} />
          <span className="text-xs text-muted-foreground">{filteredRaw.length} raw rows · {filteredSum.length} summaries</span>
        </div>

        {/* Jobs Table */}
        <Section title="Sync Job History" icon={Clock}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Job Type', 'Started', 'Finished', 'Status', 'Records', 'Summary / Error'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? Array(3).fill(0).map((_, i) => (
                  <tr key={i}>{Array(6).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-muted rounded animate-pulse" /></td>)}</tr>
                )) : jobs.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No jobs yet — run a sync action above.</td></tr>
                ) : jobs.map(j => {
                  const sc = JOB_STATUS[j.status] || {};
                  return (
                    <tr key={j.id} className="hover:bg-muted/10">
                      <td className="px-4 py-2.5 font-mono font-semibold">{j.job_type}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(j.started_at)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(j.finished_at)}</td>
                      <td className="px-4 py-2.5"><span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', sc.cls)}>{sc.label || j.status}</span></td>
                      <td className="px-4 py-2.5 text-center font-mono">{j.records_processed ?? '—'}</td>
                      <td className="px-4 py-2.5 max-w-[280px]">
                        {j.error_message ? <span className="text-red-600">{j.error_message}</span> : <span className="text-muted-foreground">{j.response_summary || '—'}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Raw Snapshot Table */}
        <Section title={`Raw Market Snapshots (${filteredRaw.length})`} icon={Database}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1100px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Date', 'SKU', 'Competitor Shop', 'Product Name', 'Price', 'Rank', 'Est. Units Sold', 'Source'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? Array(4).fill(0).map((_, i) => (
                  <tr key={i}>{Array(8).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-muted rounded animate-pulse" /></td>)}</tr>
                )) : filteredRaw.slice(0, 50).length === 0 ? (
                  <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No raw snapshots. Import CSV or run sync.</td></tr>
                ) : filteredRaw.slice(0, 50).map(r => (
                  <tr key={r.id} className="hover:bg-muted/10">
                    <td className="px-4 py-2.5 text-muted-foreground">{r.snapshot_date}</td>
                    <td className="px-4 py-2.5"><span className="font-mono font-semibold">{r.sku || '—'}</span></td>
                    <td className="px-4 py-2.5 max-w-[120px] truncate">{r.competitor_shop_name || '—'}</td>
                    <td className="px-4 py-2.5 max-w-[150px] truncate">{r.competitor_product_name || '—'}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold">₫{parseFloat(r.competitor_price || 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-center">
                      {r.rank_position ? <span className={cn('font-bold', r.rank_position <= 10 ? 'text-emerald-600' : r.rank_position <= 20 ? 'text-yellow-600' : 'text-muted-foreground')}>#{r.rank_position}</span> : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.estimated_units_sold ? r.estimated_units_sold.toLocaleString() : '—'}</td>
                    <td className="px-4 py-2.5"><span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{r.source_type || '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Daily Market Summary */}
        <Section title={`Daily Market Summary (${filteredSum.length})`} icon={BarChart3}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1200px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['SKU', 'Date', 'Market Low', 'Market Avg', 'Market High', 'Competitor Price', 'Count', 'Est. Units', 'Rank', 'Bucket', 'Source'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? Array(4).fill(0).map((_, i) => (
                  <tr key={i}>{Array(11).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-muted rounded animate-pulse" /></td>)}</tr>
                )) : filteredSum.length === 0 ? (
                  <tr><td colSpan={11} className="py-8 text-center text-muted-foreground">No summaries yet — run Transform after syncing raw data.</td></tr>
                ) : filteredSum.slice(0, 50).map(s => (
                  <tr key={s.id} className="hover:bg-muted/10">
                    <td className="px-4 py-2.5 font-mono font-semibold">{s.sku}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.summary_date}</td>
                    <td className="px-4 py-2.5 font-mono text-emerald-700">₫{parseFloat(s.market_low || 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-mono">₫{parseFloat(s.market_avg || 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-mono text-red-500">₫{parseFloat(s.market_high || 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-primary">₫{parseFloat(s.competitor_price || 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-center">{s.competitor_count || '—'}</td>
                    <td className="px-4 py-2.5">{s.estimated_market_units ? s.estimated_market_units.toLocaleString() : '—'}</td>
                    <td className="px-4 py-2.5 text-center font-bold">{s.current_rank ? `#${s.current_rank}` : '—'}</td>
                    <td className="px-4 py-2.5"><span className={cn('text-[10px] font-semibold', RANK_BUCKET_COLORS[s.rank_bucket])}>{s.rank_bucket || '—'}</span></td>
                    <td className="px-4 py-2.5 text-muted-foreground text-[10px]">{s.source_type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Competitor Watchlist */}
        <Section title="Competitor Watchlist" icon={Eye}>
          {/* Add Form */}
          <div className="px-5 py-4 border-b border-border bg-muted/10">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px] mb-1 block text-muted-foreground uppercase tracking-wide">SKU *</Label>
                <Input value={wlForm.sku} onChange={e => setWlForm(f => ({ ...f, sku: e.target.value }))} placeholder="CAT.0010.010" className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] mb-1 block text-muted-foreground uppercase tracking-wide">Keyword</Label>
                <Input value={wlForm.keyword} onChange={e => setWlForm(f => ({ ...f, keyword: e.target.value }))} placeholder="cat litter 10L" className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] mb-1 block text-muted-foreground uppercase tracking-wide">Tracked Shop</Label>
                <Input value={wlForm.tracked_shop_name} onChange={e => setWlForm(f => ({ ...f, tracked_shop_name: e.target.value }))} placeholder="competitor shop name" className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] mb-1 block text-muted-foreground uppercase tracking-wide">Product Name</Label>
                <Input value={wlForm.tracked_product_name} onChange={e => setWlForm(f => ({ ...f, tracked_product_name: e.target.value }))} placeholder="product name" className="h-7 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] mb-1 block text-muted-foreground uppercase tracking-wide">Product URL</Label>
                <Input value={wlForm.tracked_product_url} onChange={e => setWlForm(f => ({ ...f, tracked_product_url: e.target.value }))} placeholder="https://shopee.vn/..." className="h-7 text-xs" />
              </div>
              <div className="flex items-end">
                <Button size="sm" onClick={handleSaveWatchlist} disabled={savingWl} className="h-7 text-xs gap-1">
                  + Add
                </Button>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['SKU', 'Keyword', 'Tracked Shop', 'Product Name', 'URL', 'Active', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? Array(3).fill(0).map((_, i) => (
                  <tr key={i}>{Array(7).fill(0).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-muted rounded animate-pulse" /></td>)}</tr>
                )) : watchlist.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No watchlist entries yet.</td></tr>
                ) : watchlist.map(w => (
                  <tr key={w.id} className="hover:bg-muted/10">
                    <td className="px-4 py-2.5 font-mono font-semibold">{w.sku}</td>
                    <td className="px-4 py-2.5">{w.keyword || '—'}</td>
                    <td className="px-4 py-2.5">{w.tracked_shop_name || '—'}</td>
                    <td className="px-4 py-2.5 max-w-[160px] truncate">{w.tracked_product_name || '—'}</td>
                    <td className="px-4 py-2.5 max-w-[140px] truncate">
                      {w.tracked_product_url ? <a href={w.tracked_product_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{w.tracked_product_url.slice(0, 40)}…</a> : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', w.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground')}>
                        {w.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-red-500" onClick={() => handleDeleteWl(w.id)}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}