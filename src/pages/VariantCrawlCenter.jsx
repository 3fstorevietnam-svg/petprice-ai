import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import PageHeader from '@/components/PageHeader';
import {
  Play, RefreshCw, Webhook, Layers, Zap, Search,
  Loader2, CheckCircle2, AlertCircle, Clock, Database, BarChart3
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const JOB_STATUS = {
  running: 'bg-blue-100 text-blue-700',
  success: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

function KpiCard({ icon: Icon, label, value, sub, color = 'text-foreground' }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className="p-2 rounded-lg bg-muted">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-xl font-bold', color)}>{value ?? '—'}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function VariantCrawlCenter() {
  const [jobs, setJobs] = useState([]);
  const [rawVariants, setRawVariants] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [seeds, setSeeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [j, r, s, sd] = await Promise.all([
      base44.entities.VariantCrawlJob.list('-started_at', 50),
      base44.entities.MarketVariantSnapshotRaw.list('-synced_at', 200),
      base44.entities.MarketVariantSummaryDaily.list('-summary_date', 200),
      base44.entities.MarketProductSeed.list('-created_date', 500),
    ]);
    setJobs(j); setRawVariants(r); setSummaries(s); setSeeds(sd);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const runFn = async (fnName, label) => {
    setBusy(fnName);
    try {
      const res = await base44.functions.invoke(fnName, {});
      toast({ title: `${label} complete`, description: JSON.stringify(res.data || {}).slice(0, 200) });
      await load();
    } catch (e) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
    setBusy(null);
  };

  const today = new Date().toISOString().slice(0, 10);
  const rawToday = rawVariants.filter(r => r.snapshot_date === today || r.synced_at?.startsWith(today)).length;
  const sumToday = summaries.filter(s => s.summary_date === today).length;

  const statusCounts = seeds.reduce((a, s) => { a[s.crawl_status] = (a[s.crawl_status] || 0) + 1; return a; }, {});

  const filteredRaw = rawVariants.filter(r =>
    !search || r.sku?.toLowerCase().includes(search.toLowerCase()) ||
    r.parent_product_name?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredSum = summaries.filter(s =>
    !search || s.sku?.toLowerCase().includes(search.toLowerCase()) ||
    s.variant_display_name?.toLowerCase().includes(search.toLowerCase())
  );

  const isBusy = !!busy;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Variant Crawl Center"
        subtitle="Deep product-level crawl management — queue, receive, transform"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => runFn('queueVariantCrawl', 'Queue Seeds')} disabled={isBusy}>
              {busy === 'queueVariantCrawl' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Queue Seeds
            </Button>
            <Button size="sm" variant="outline" onClick={() => runFn('receiveVariantCrawlerWebhook', 'Webhook')} disabled={isBusy}>
              {busy === 'receiveVariantCrawlerWebhook' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Webhook className="w-3.5 h-3.5" />}
              Test Webhook
            </Button>
            <Button size="sm" variant="outline" onClick={() => runFn('transformVariantSummary', 'Transform')} disabled={isBusy}>
              {busy === 'transformVariantSummary' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
              Transform
            </Button>
            <Button size="sm" className="bg-primary" onClick={() => runFn('runFullVariantSync', 'Full Sync')} disabled={isBusy}>
              {busy === 'runFullVariantSync' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Full Sync
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard icon={Clock} label="Pending Seeds" value={statusCounts.pending || 0} color="text-yellow-600" />
          <KpiCard icon={Loader2} label="Queued Seeds" value={statusCounts.queued || 0} color="text-blue-600" />
          <KpiCard icon={CheckCircle2} label="Crawled Seeds" value={statusCounts.crawled || 0} color="text-emerald-600" />
          <KpiCard icon={AlertCircle} label="Failed Seeds" value={statusCounts.failed || 0} color="text-red-600" />
          <KpiCard icon={Database} label="Raw Variants Today" value={rawToday} sub={`${rawVariants.length} total`} />
          <KpiCard icon={BarChart3} label="Summaries Today" value={sumToday} sub={`${summaries.length} total`} />
        </div>

        {/* Job History */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Crawl Job History</h3>
            <span className="text-xs text-muted-foreground ml-auto">{jobs.length} jobs</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {['Job Type', 'Started', 'Finished', 'Status', 'Records', 'Summary / Error'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? Array(3).fill(0).map((_, i) => (
                  <tr key={i}>{Array(6).fill(0).map((_, j) => <td key={j} className="px-3 py-2.5"><div className="h-3 bg-muted rounded animate-pulse" /></td>)}</tr>
                )) : jobs.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">No jobs yet. Run a sync to get started.</td></tr>
                ) : jobs.map(j => (
                  <tr key={j.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-mono font-semibold">{j.job_type}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{j.started_at ? new Date(j.started_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{j.finished_at ? new Date(j.finished_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', JOB_STATUS[j.status] || 'bg-gray-100 text-gray-600')}>{j.status}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono">{j.records_processed ?? '—'}</td>
                    <td className="px-3 py-2.5 max-w-[300px] text-muted-foreground truncate" title={j.response_summary || j.error_message}>
                      {j.error_message ? <span className="text-red-500">{j.error_message.slice(0, 80)}</span> : (j.response_summary?.slice(0, 100) || '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-xs" placeholder="Filter by SKU or product…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Raw Variants */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Raw Variant Snapshots</h3>
            <span className="text-xs text-muted-foreground ml-auto">{filteredRaw.length} rows</span>
          </div>
          <div className="overflow-auto max-h-72">
            <table className="w-full text-xs min-w-[1100px]">
              <thead className="sticky top-0 bg-muted/80">
                <tr className="border-b border-border">
                  {['SKU', 'Parent Product', 'Shop', 'Variant Name', 'Weight', 'Pack', 'Flavor', 'Price', 'Stock', 'Sold Est.'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRaw.length === 0 ? (
                  <tr><td colSpan={10} className="py-6 text-center text-xs text-muted-foreground">No raw variant data yet.</td></tr>
                ) : filteredRaw.slice(0, 100).map(r => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono font-semibold">{r.sku || '—'}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate">{r.parent_product_name || '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[120px] truncate">{r.competitor_shop_name || '—'}</td>
                    <td className="px-3 py-2 max-w-[140px] truncate">{r.variant_name || '—'}</td>
                    <td className="px-3 py-2">{r.normalized_weight || '—'}</td>
                    <td className="px-3 py-2 text-center">{r.normalized_pack_count || '—'}</td>
                    <td className="px-3 py-2">{r.normalized_flavor || '—'}</td>
                    <td className="px-3 py-2 font-mono font-semibold">{r.variant_price ? `₫${parseFloat(r.variant_price).toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-2 text-center">{r.variant_stock ?? '—'}</td>
                    <td className="px-3 py-2 text-center">{r.variant_sold_est ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Variant Summaries */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Variant Summary (Normalized)</h3>
            <span className="text-xs text-muted-foreground ml-auto">{filteredSum.length} variants</span>
          </div>
          <div className="overflow-auto max-h-72">
            <table className="w-full text-xs min-w-[1100px]">
              <thead className="sticky top-0 bg-muted/80">
                <tr className="border-b border-border">
                  {['SKU', 'Variant Key', 'Display Name', 'Price Low', 'Price Avg', 'Price High', '# Competitors', 'Strongest Price', 'Strongest Shop'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredSum.length === 0 ? (
                  <tr><td colSpan={9} className="py-6 text-center text-xs text-muted-foreground">No summaries yet. Run Transform to compute variant summaries.</td></tr>
                ) : filteredSum.slice(0, 100).map(s => (
                  <tr key={s.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono font-semibold">{s.sku}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground text-[10px] max-w-[140px] truncate" title={s.variant_key}>{s.variant_key}</td>
                    <td className="px-3 py-2 font-medium">{s.variant_display_name || '—'}</td>
                    <td className="px-3 py-2 font-mono text-emerald-700">{s.competitor_price_low ? `₫${parseFloat(s.competitor_price_low).toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-2 font-mono font-semibold">{s.competitor_price_avg ? `₫${parseFloat(s.competitor_price_avg).toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-2 font-mono text-red-600">{s.competitor_price_high ? `₫${parseFloat(s.competitor_price_high).toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-2 text-center">{s.competitor_count ?? '—'}</td>
                    <td className="px-3 py-2 font-mono font-bold text-primary">{s.strongest_competitor_price ? `₫${parseFloat(s.strongest_competitor_price).toLocaleString()}` : '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{s.strongest_competitor_shop || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}