import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Download, Upload, CheckCircle2, XCircle, FileText, AlertTriangle } from 'lucide-react';

const TEMPLATE_HEADERS = ['sku','name','category','cost','current_price','shopee_fee_rate','ops_fee','packing_fee','fixed_fee','sku_role','combo_qty','min_price','max_price','status','notes'];
const SAMPLE_ROW = ['DEMO.001','Sample Product','pate','50000','89000','0.22','3000','11000','1833','core','1','70000','','active','Demo note'];

const VALID_ROLES = ['moi','core','upsell'];
const VALID_STATUSES = ['active','paused','killed'];

function downloadCSV() {
  const rows = [TEMPLATE_HEADERS, SAMPLE_ROW];
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'product_import_template.csv'; a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const parseRow = line => {
    const result = []; let cur = ''; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  };
  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/["\s]/g, ''));
  const rows = lines.slice(1).map((line, idx) => {
    const vals = parseRow(line);
    const obj = { _row: idx + 2 };
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

function validateRow(row) {
  const errors = [];
  if (!row.sku?.trim()) errors.push('SKU required');
  if (!row.name?.trim()) errors.push('Name required');
  const cost = parseFloat(row.cost);
  if (isNaN(cost) || cost < 0) errors.push('Cost must be ≥ 0');
  const price = parseFloat(row.current_price);
  if (isNaN(price) || price < 0) errors.push('current_price must be ≥ 0');
  const role = row.sku_role?.trim() || 'core';
  if (!VALID_ROLES.includes(role)) errors.push(`sku_role must be one of: ${VALID_ROLES.join(', ')}`);
  const status = row.status?.trim() || 'active';
  if (!VALID_STATUSES.includes(status)) errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  const comboQty = parseFloat(row.combo_qty || 1);
  if (isNaN(comboQty) || comboQty < 1) errors.push('combo_qty must be ≥ 1');
  const minPrice = parseFloat(row.min_price || 0);
  const maxPrice = row.max_price?.trim() ? parseFloat(row.max_price) : null;
  if (maxPrice !== null && maxPrice < minPrice) errors.push('max_price must be ≥ min_price');
  return errors;
}

function normalizeRow(row) {
  return {
    sku: row.sku.trim(),
    name: row.name.trim(),
    category: row.category?.trim() || '',
    cost: parseFloat(row.cost) || 0,
    current_price: parseFloat(row.current_price) || 0,
    shopee_fee_rate: parseFloat(row.shopee_fee_rate) || 0.22,
    ops_fee: parseFloat(row.ops_fee) || 3000,
    packing_fee: parseFloat(row.packing_fee) || 11000,
    fixed_fee: parseFloat(row.fixed_fee) || 1833,
    sku_role: VALID_ROLES.includes(row.sku_role?.trim()) ? row.sku_role.trim() : 'core',
    combo_qty: Math.max(1, parseInt(row.combo_qty) || 1),
    min_price: parseFloat(row.min_price) || 0,
    max_price: row.max_price?.trim() ? parseFloat(row.max_price) : undefined,
    status: VALID_STATUSES.includes(row.status?.trim()) ? row.status.trim() : 'active',
    notes: row.notes?.trim() || '',
  };
}

export default function ImportProductsModal({ open, onOpenChange, onImportDone }) {
  const fileRef = useRef();
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const reset = () => { setRows([]); setFileName(''); setResult(null); if (fileRef.current) fileRef.current.value = ''; };
  const handleClose = (v) => { if (!v) reset(); onOpenChange(v); };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows: parsed } = parseCSV(ev.target.result);
      const annotated = parsed.map(row => {
        const errors = validateRow(row);
        return { ...row, _errors: errors, _valid: errors.length === 0 };
      });
      setRows(annotated);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    const validRows = rows.filter(r => r._valid);
    if (!validRows.length) { toast.error('No valid rows to import'); return; }
    setImporting(true);
    try {
      const existing = await base44.entities.Product.list('-created_date', 500);
      const skuMap = existing.reduce((acc, p) => { acc[p.sku] = p; return acc; }, {});
      let created = 0, updated = 0;
      for (const row of validRows) {
        const payload = normalizeRow(row);
        if (skuMap[payload.sku]) {
          await base44.entities.Product.update(skuMap[payload.sku].id, payload);
          updated++;
        } else {
          await base44.entities.Product.create(payload);
          created++;
        }
      }
      const summary = { total: rows.length, valid: validRows.length, invalid: rows.length - validRows.length, created, updated };
      setResult(summary);
      toast.success(`Import done: ${created} created, ${updated} updated`);
      onImportDone();
    } catch (err) {
      toast.error('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const validCount = rows.filter(r => r._valid).length;
  const invalidCount = rows.length - validCount;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="w-4 h-4" />Import Products</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">

          {/* Success result */}
          {result && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-800">Import Complete</span>
              </div>
              <div className="grid grid-cols-5 gap-3">
                {[['Total Rows', result.total], ['Valid', result.valid, 'text-emerald-700'], ['Invalid', result.invalid, result.invalid > 0 ? 'text-red-600' : ''], ['Created', result.created, 'text-blue-700'], ['Updated', result.updated, 'text-violet-700']].map(([label, val, cls]) => (
                  <div key={label} className="text-center">
                    <div className={cn('text-xl font-bold', cls || 'text-foreground')}>{val}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Template */}
          <div className="border border-border rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold">1. Download Template</p>
            <p className="text-xs text-muted-foreground">Use this template to add or update SKUs in bulk. Fill in required fields, then upload below.</p>
            <Button size="sm" variant="outline" onClick={downloadCSV}>
              <Download className="w-3.5 h-3.5 mr-1.5" />Download CSV Template
            </Button>
          </div>

          {/* Step 2: Upload */}
          <div className="border border-border rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold">2. Upload File</p>
            <p className="text-xs text-muted-foreground">CSV is recommended. Ensure headers match the template exactly.</p>
            <div
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <FileText className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              {fileName
                ? <p className="text-sm font-medium text-foreground">{fileName}</p>
                : <p className="text-sm text-muted-foreground">Click to select a .csv file</p>
              }
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>

          {/* Step 3: Preview */}
          {rows.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
                <p className="text-sm font-semibold">3. Preview ({rows.length} rows)</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-emerald-700 font-semibold">{validCount} valid</span>
                  {invalidCount > 0 && <span className="text-red-600 font-semibold">{invalidCount} invalid</span>}
                </div>
              </div>
              <div className="overflow-auto max-h-64">
                <table className="w-full text-xs min-w-[900px]">
                  <thead className="sticky top-0 bg-muted/80">
                    <tr>
                      {['#', 'SKU', 'Name', 'Category', 'Cost', 'Price', 'Role', 'Status', 'Result'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row, i) => (
                      <tr key={i} className={cn(row._valid ? 'bg-white hover:bg-muted/10' : 'bg-red-50 hover:bg-red-100/60')}>
                        <td className="px-3 py-2 text-muted-foreground">{row._row}</td>
                        <td className="px-3 py-2 font-mono font-semibold">{row.sku || <span className="italic text-red-500">blank</span>}</td>
                        <td className="px-3 py-2 max-w-[140px] truncate">{row.name || <span className="italic text-red-500">blank</span>}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.category || '—'}</td>
                        <td className="px-3 py-2 font-mono">{row.cost || '—'}</td>
                        <td className="px-3 py-2 font-mono">{row.current_price || '—'}</td>
                        <td className="px-3 py-2">{row.sku_role || 'core'}</td>
                        <td className="px-3 py-2">{row.status || 'active'}</td>
                        <td className="px-3 py-2">
                          {row._valid
                            ? <span className="flex items-center gap-1 text-emerald-600 font-semibold"><CheckCircle2 className="w-3 h-3" />OK</span>
                            : <span className="flex items-start gap-1 text-red-600"><XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" /><span className="text-[10px] leading-tight">{row._errors.join('; ')}</span></span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Invalid warning */}
          {invalidCount > 0 && rows.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{invalidCount} invalid row(s) will be skipped. Only {validCount} valid row(s) will be imported.</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border flex-shrink-0">
          <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
          <Button
            onClick={handleImport}
            disabled={importing || validCount === 0}
            className="gap-2"
          >
            {importing
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Importing...</>
              : <><Upload className="w-3.5 h-3.5" />Import {validCount > 0 ? `${validCount} Valid Rows` : 'Valid Rows'}</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}