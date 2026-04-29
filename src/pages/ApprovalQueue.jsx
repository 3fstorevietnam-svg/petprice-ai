import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  CheckCircle2, XCircle, Eye, TestTube, AlertTriangle,
  Skull, TrendingUp, TrendingDown, Layers, Brain
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ACTION_STYLES = {
  GIU_GIA:   { cls: 'bg-blue-100 text-blue-800',       label: 'GIỮ GIÁ',   icon: null },
  TANG_GIA:  { cls: 'bg-emerald-100 text-emerald-800', label: 'TĂNG GIÁ',  icon: TrendingUp },
  GIAM_GIA:  { cls: 'bg-red-100 text-red-800',         label: 'GIẢM GIÁ',  icon: TrendingDown },
  GOM_COMBO: { cls: 'bg-purple-100 text-purple-800',   label: 'GOM COMBO', icon: Layers },
  KILL_SKU:  { cls: 'bg-gray-200 text-gray-700',       label: 'KILL SKU',  icon: Skull },
};
const ADS_STYLES = {
  GIU_NGUYEN:             { cls: 'bg-muted text-muted-foreground',  label: 'Giữ Nguyên' },
  CHAY_ADS:               { cls: 'bg-orange-100 text-orange-800',   label: 'CHẠY ADS' },
  NGUNG_ADS:              { cls: 'bg-yellow-100 text-yellow-800',    label: 'NGỪNG ADS' },
  TEST_LAI_GIA_VA_CONTENT:{ cls: 'bg-violet-100 text-violet-800',   label: 'Test Lại' },
};

function DetailModal({ item, onClose }) {
  if (!item) return null;
  const actionStyle = ACTION_STYLES[item.suggested_action] || {};
  const adsStyle = ADS_STYLES[item.ads_action] || {};
  const priceDelta = item.suggested_price && item.current_price
    ? parseFloat(item.suggested_price) - parseFloat(item.current_price) : null;

  const rows = [
    { label: 'SKU', value: <span className="font-mono font-bold">{item.sku}</span> },
    { label: 'Ngày gợi ý', value: item.rec_date },
    { label: 'Giá hiện tại', value: item.current_price ? `₫${parseFloat(item.current_price).toLocaleString()}` : '—' },
    { label: 'Lợi nhuận hiện tại', value: item.current_profit != null
        ? <span className={item.current_profit < 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>₫{parseFloat(item.current_profit).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</span> : '—' },
    { label: 'Margin hiện tại', value: item.current_margin != null
        ? <span className={item.current_margin < 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'}>{parseFloat(item.current_margin).toFixed(2)}%</span> : '—' },
    { label: 'Hành động đề xuất', value: <span className={cn('text-xs font-bold px-2 py-1 rounded-md', actionStyle.cls)}>{actionStyle.label || item.suggested_action}</span> },
    { label: 'Giá đề xuất', value: item.suggested_price
        ? <span className="font-mono font-bold text-primary">
            ₫{parseFloat(item.suggested_price).toLocaleString()}
            {priceDelta !== null && <span className={cn('text-xs ml-1.5', priceDelta > 0 ? 'text-emerald-600' : 'text-red-500')}>
              ({priceDelta > 0 ? '+' : ''}{((priceDelta / parseFloat(item.current_price)) * 100).toFixed(1)}%)
            </span>}
          </span> : '—' },
    { label: 'Combo Qty', value: item.suggested_combo_qty ? <span className="font-bold text-purple-700">{item.suggested_combo_qty} đơn</span> : '—' },
    { label: 'Ads Action', value: item.ads_action ? <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', adsStyle.cls)}>{adsStyle.label}</span> : '—' },
    { label: 'Confidence', value: item.confidence ? `${item.confidence}%` : '—' },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Brain className="w-4 h-4 text-primary" />Chi tiết gợi ý — {item.sku}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            {rows.map(({ label, value }) => (
              <div key={label} className="bg-muted/30 rounded-lg px-3 py-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                <div className="text-sm">{value}</div>
              </div>
            ))}
          </div>
          {item.reason && (
            <div className="bg-muted/40 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Lý do đầy đủ</p>
              <p className="text-sm leading-relaxed">{item.reason}</p>
            </div>
          )}
          {item.admin_note && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-blue-700 mb-1">Ghi chú admin</p>
              <p className="text-sm">{item.admin_note}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ApprovalQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState({});
  const [detailItem, setDetailItem] = useState(null);
  const [noteMap, setNoteMap] = useState({});

  const load = () => {
    setLoading(true);
    base44.entities.AISuggestion.filter({ status: 'pending' }, '-rec_date', 200)
      .then(d => { setItems(d); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const setProc = (id, v) => setProcessing(p => ({ ...p, [id]: v }));

  // Action 2: Approve Suggestion
  const approveSuggestion = async (item) => {
    setProc(item.id, true);
    await base44.entities.AISuggestion.update(item.id, {
      status: 'approved',
      admin_note: noteMap[item.id] || undefined,
    });
    toast.success(`✅ Đã duyệt gợi ý cho SKU ${item.sku}`);
    setItems(prev => prev.filter(i => i.id !== item.id));
    setProc(item.id, false);
  };

  // Action 3: Reject Suggestion
  const rejectSuggestion = async (item) => {
    setProc(item.id, true);
    await base44.entities.AISuggestion.update(item.id, {
      status: 'rejected',
      admin_note: noteMap[item.id] || undefined,
    });
    toast.success(`❌ Đã từ chối gợi ý cho SKU ${item.sku}`);
    setItems(prev => prev.filter(i => i.id !== item.id));
    setProc(item.id, false);
  };

  // Action 5: Start 7-Day Price Test
  const startPriceTest = async (item) => {
    if (!item.suggested_price) { toast.error('Cần có giá đề xuất để tạo price test'); return; }
    setProc(item.id, true);
    // Create row in price_test_log
    await base44.entities.PriceTestLog.create({
      sku: item.sku,
      old_price: item.current_price,
      test_price: item.suggested_price,
      test_start_date: format(new Date(), 'yyyy-MM-dd'),
      status: 'planned',
      result_note: `AI Suggestion ${item.rec_date}: ${(item.reason || '').slice(0, 300)}`,
    });
    // Mark suggestion as testing
    await base44.entities.AISuggestion.update(item.id, {
      status: 'testing',
      admin_note: noteMap[item.id] || 'Test giá 7 ngày',
    });
    toast.success(`🧪 Đã tạo Price Test cho SKU ${item.sku} — ₫${parseFloat(item.current_price).toLocaleString()} → ₫${parseFloat(item.suggested_price).toLocaleString()}`);
    setItems(prev => prev.filter(i => i.id !== item.id));
    setProc(item.id, false);
  };

  // Action 6: Mark SKU Killed
  const markKilled = async (item) => {
    setProc(item.id, true);
    // Find product by SKU and update status to killed
    const products = await base44.entities.Product.filter({ sku: item.sku });
    if (products.length > 0) {
      await base44.entities.Product.update(products[0].id, { status: 'killed' });
    }
    // Also mark suggestion as approved
    await base44.entities.AISuggestion.update(item.id, {
      status: 'approved',
      admin_note: noteMap[item.id] || 'SKU đã được kill',
    });
    toast.success(`💀 SKU ${item.sku} đã được đánh dấu KILLED`);
    setItems(prev => prev.filter(i => i.id !== item.id));
    setProc(item.id, false);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Price Approval Queue"
        subtitle={`${items.length} suggestions chờ phê duyệt`}
        actions={
          <span className="text-xs text-muted-foreground bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 font-medium text-orange-700">
            ⚠️ Không có thay đổi nào được push lên Shopee — Admin phải duyệt thủ công
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {loading ? (
          Array(4).fill(0).map((_, i) => <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse h-36" />)
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <CheckCircle2 className="w-12 h-12 mb-3 opacity-20" />
            <p className="font-medium text-base">Không có gợi ý nào chờ duyệt</p>
            <p className="text-sm mt-1">Nhấn "Run AI Suggestions Now" trên Dashboard để tạo gợi ý mới</p>
          </div>
        ) : items.map(item => {
          const actionStyle = ACTION_STYLES[item.suggested_action] || {};
          const adsStyle = ADS_STYLES[item.ads_action] || {};
          const isLosing = (item.current_profit != null && item.current_profit < 0) || (item.current_margin != null && item.current_margin < 0);
          const isKillSku = item.suggested_action === 'KILL_SKU';
          const isCombo = item.suggested_action === 'GOM_COMBO';
          const priceDelta = item.suggested_price && item.current_price
            ? parseFloat(item.suggested_price) - parseFloat(item.current_price) : null;
          const disabled = processing[item.id];

          return (
            <div key={item.id} className={cn(
              'bg-card border rounded-xl p-5 space-y-3 transition-shadow hover:shadow-sm',
              isLosing ? 'border-red-200 bg-red-50/20' :
              isKillSku ? 'border-gray-300 bg-gray-50/40' :
              isCombo ? 'border-purple-200 bg-purple-50/10' :
              'border-border'
            )}>
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-mono font-bold text-base">{item.sku}</span>
                  <span className={cn('text-xs font-bold px-2.5 py-1 rounded-md', actionStyle.cls)}>
                    {actionStyle.label || item.suggested_action}
                  </span>
                  {item.ads_action && item.ads_action !== 'GIU_NGUYEN' && (
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', adsStyle.cls)}>{adsStyle.label}</span>
                  )}
                  {isLosing && (
                    <span className="flex items-center gap-1 text-xs text-red-600 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5" />Đang lỗ
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{item.rec_date}</span>
                  {item.confidence && <span className="bg-muted px-2 py-0.5 rounded-full font-medium">Confidence: {item.confidence}%</span>}
                </div>
              </div>

              {/* Metrics Row */}
              <div className="flex items-center gap-5 flex-wrap text-sm">
                {item.current_price && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Giá hiện tại</p>
                    <p className="font-mono font-bold">₫{parseFloat(item.current_price).toLocaleString()}</p>
                  </div>
                )}
                {item.suggested_price && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Giá đề xuất</p>
                    <div className="flex items-baseline gap-1.5">
                      <p className="font-mono font-bold text-primary">₫{parseFloat(item.suggested_price).toLocaleString()}</p>
                      {priceDelta !== null && (
                        <span className={cn('text-xs font-semibold', priceDelta > 0 ? 'text-emerald-600' : 'text-red-500')}>
                          {priceDelta > 0 ? '+' : ''}{((priceDelta / parseFloat(item.current_price)) * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {item.current_profit != null && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Lợi nhuận</p>
                    <p className={cn('font-mono font-bold', item.current_profit < 0 ? 'text-red-600' : 'text-emerald-600')}>
                      ₫{parseFloat(item.current_profit).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                )}
                {item.current_margin != null && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Margin</p>
                    <p className={cn('font-bold', item.current_margin < 0 ? 'text-red-600' : 'text-emerald-600')}>
                      {parseFloat(item.current_margin).toFixed(1)}%
                    </p>
                  </div>
                )}
                {item.suggested_combo_qty && (
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Combo Qty</p>
                    <p className="font-bold text-purple-700">{item.suggested_combo_qty} đơn</p>
                  </div>
                )}
              </div>

              {/* Reason */}
              {item.reason && (
                <div className="bg-muted/40 rounded-lg px-4 py-2.5">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Lý do AI:</p>
                  <p className="text-sm text-foreground leading-relaxed line-clamp-3">{item.reason}</p>
                </div>
              )}

              {/* Admin Note */}
              <Textarea
                placeholder="Ghi chú admin (tuỳ chọn)..."
                className="text-xs h-12 resize-none"
                value={noteMap[item.id] || ''}
                onChange={e => setNoteMap(m => ({ ...m, [item.id]: e.target.value }))}
              />

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {/* Action 2: Approve */}
                <Button size="sm" disabled={disabled}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
                  onClick={() => approveSuggestion(item)}>
                  <CheckCircle2 className="w-3.5 h-3.5" />Duyệt
                </Button>

                {/* Action 3: Reject */}
                <Button size="sm" variant="outline" disabled={disabled}
                  className="border-red-200 text-red-600 hover:bg-red-50 font-semibold gap-1.5"
                  onClick={() => rejectSuggestion(item)}>
                  <XCircle className="w-3.5 h-3.5" />Từ Chối
                </Button>

                {/* Action 5: 7-day price test (only if has suggested_price) */}
                {item.suggested_price && (
                  <Button size="sm" variant="outline" disabled={disabled}
                    className="border-blue-200 text-blue-700 hover:bg-blue-50 font-semibold gap-1.5"
                    onClick={() => startPriceTest(item)}>
                    <TestTube className="w-3.5 h-3.5" />Test Giá 7 Ngày
                  </Button>
                )}

                {/* Action 6: Mark Killed (only for KILL_SKU suggestions) */}
                {isKillSku && (
                  <Button size="sm" variant="outline" disabled={disabled}
                    className="border-gray-300 text-gray-700 hover:bg-gray-100 font-semibold gap-1.5"
                    onClick={() => markKilled(item)}>
                    <Skull className="w-3.5 h-3.5" />Kill SKU
                  </Button>
                )}

                {/* Action 4: View Reason */}
                <Button size="sm" variant="ghost" disabled={disabled}
                  className="text-muted-foreground gap-1.5 ml-auto"
                  onClick={() => setDetailItem(item)}>
                  <Eye className="w-3.5 h-3.5" />Xem Chi Tiết
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action 4: Detail Modal */}
      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  );
}