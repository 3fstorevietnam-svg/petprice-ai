import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Zap, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const today = new Date().toISOString().slice(0, 10);

const EXAMPLES = {
  links: `https://shopee.vn/product/123456/987654321\nhttps://shopee.vn/example-product-i.123456.987654322`,
  sku_links: `SKU001,https://shopee.vn/product/123456/987654321,San pham A\nSKU002,https://shopee.vn/example-product-i.123456.987654322,San pham B`,
  metric_csv: `Tên sản phẩm,Link sản phẩm,Mã sản phẩm\nSan pham A,https://shopee.vn/product/123456/987654321,1__987654321__123456\nSan pham B,https://shopee.vn/example-product-i.123456.987654322,1__987654322__123456`,
};

export default function ApifyVariantInputBuilder() {
  const [inputText, setInputText] = useState('');
  const [snapshotDate, setSnapshotDate] = useState(today);
  const [webhookUrl, setWebhookUrl] = useState('https://3fsmartprice.base44.app/functions/shopee-variant-bulk-upsert');
  const [runSource, setRunSource] = useState('base44_variant_input_builder');
  const [maxRequests, setMaxRequests] = useState(100);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleBuild = async () => {
    if (!inputText.trim()) { toast.error('Paste some links or CSV first'); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke('buildApifyVariantInput', {
        text: inputText,
        snapshot_date: snapshotDate,
        webhook_url: webhookUrl || undefined,
        run_source: runSource,
        max_requests_per_crawl: Number(maxRequests),
      });
      setResult(res.data);
      toast.success(`Converted ${res.data.converted} items`);
    } catch (e) {
      toast.error('Error: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result?.apify_input_json) return;
    navigator.clipboard.writeText(result.apify_input_json);
    toast.success('JSON copied to clipboard');
  };

  const handleClear = () => {
    setInputText('');
    setResult(null);
  };

  const loadExample = (key) => {
    setInputText(EXAMPLES[key]);
    setResult(null);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Apify Variant Input Builder"
        subtitle="Convert Shopee links or CSV into Apify actor JSON input"
      />

      <div className="flex-1 overflow-auto p-5">
        <div className="max-w-5xl mx-auto space-y-5">

          {/* Examples */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Examples — click to load</p>
            <Tabs defaultValue="links">
              <TabsList className="h-8">
                <TabsTrigger value="links" className="text-xs px-3">Links</TabsTrigger>
                <TabsTrigger value="sku_links" className="text-xs px-3">SKU + Links</TabsTrigger>
                <TabsTrigger value="metric_csv" className="text-xs px-3">Metric CSV</TabsTrigger>
              </TabsList>
              {Object.entries(EXAMPLES).map(([key, val]) => (
                <TabsContent key={key} value={key} className="mt-2">
                  <div className="flex items-start gap-3">
                    <pre className="flex-1 text-xs bg-muted rounded-lg px-4 py-3 font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap">{val}</pre>
                    <Button size="sm" variant="outline" className="flex-shrink-0 text-xs h-8" onClick={() => loadExample(key)}>
                      Load
                    </Button>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>

          {/* Input form */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div>
              <Label className="text-xs font-semibold mb-1.5 block">Shopee links / CSV / Metric <span className="text-red-500">*</span></Label>
              <Textarea
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                placeholder={`SKU001,https://shopee.vn/product/123456/987654321,San pham A\nSKU002,https://shopee.vn/example-product-i.123456.987654322,San pham B`}
                className="font-mono text-xs h-36 resize-y"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Snapshot date</Label>
                <Input
                  type="date"
                  value={snapshotDate}
                  onChange={e => setSnapshotDate(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Run source</Label>
                <Input
                  value={runSource}
                  onChange={e => setRunSource(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold mb-1.5 block">Max requests per crawl</Label>
                <Input
                  type="number"
                  value={maxRequests}
                  onChange={e => setMaxRequests(e.target.value)}
                  className="h-8 text-sm"
                  min={1}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold mb-1.5 block">Base44 variant webhook URL</Label>
              <Input
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://3fsmartprice.base44.app/functions/shopee-variant-bulk-upsert"
                className="h-8 text-sm font-mono"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button onClick={handleBuild} disabled={loading} className="h-8 text-sm">
                <Zap className="w-4 h-4 mr-1.5" />
                {loading ? 'Building...' : 'Build Apify Input'}
              </Button>
              <Button variant="outline" onClick={handleCopy} disabled={!result?.apify_input_json} className="h-8 text-sm">
                <Copy className="w-4 h-4 mr-1.5" />
                Copy JSON
              </Button>
              <Button variant="ghost" onClick={handleClear} className="h-8 text-sm text-muted-foreground">
                <X className="w-4 h-4 mr-1.5" />
                Clear
              </Button>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              {/* Stats */}
              <div className="flex items-center gap-4">
                <div className={cn('flex items-center gap-1.5 text-sm font-semibold', result.converted > 0 ? 'text-emerald-600' : 'text-muted-foreground')}>
                  <CheckCircle2 className="w-4 h-4" />
                  {result.converted} converted
                </div>
                {result.skipped > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-orange-600 font-semibold">
                    <AlertCircle className="w-4 h-4" />
                    {result.skipped} skipped
                  </div>
                )}
                <span className="text-xs text-muted-foreground ml-auto">{result.received} received</span>
              </div>

              {/* JSON output */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs font-semibold">Apify Actor Input JSON</Label>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleCopy}>
                    <Copy className="w-3 h-3 mr-1" /> Copy
                  </Button>
                </div>
                <pre className="w-full bg-muted rounded-lg px-4 py-3 text-xs font-mono text-foreground whitespace-pre overflow-auto max-h-[480px] leading-relaxed">
                  {result.apify_input_json}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}