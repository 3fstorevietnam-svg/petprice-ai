import { cn } from '@/lib/utils';

const ACTION_CONFIG = {
  TANG_GIA:  { label: 'TĂNG GIÁ',  cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  GIAM_GIA:  { label: 'GIẢM GIÁ',  cls: 'bg-red-100 text-red-800 border-red-200' },
  GIU_GIA:   { label: 'GIỮ GIÁ',   cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  GOM_COMBO: { label: 'GOM COMBO', cls: 'bg-purple-100 text-purple-800 border-purple-200' },
  KILL_SKU:  { label: 'KILL SKU',  cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  CHAY_ADS:  { label: 'CHẠY ADS',  cls: 'bg-orange-100 text-orange-800 border-orange-200' },
  NGUNG_ADS: { label: 'NGỪNG ADS', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
};

export default function ActionBadge({ action, size = 'sm' }) {
  const config = ACTION_CONFIG[action] || { label: action, cls: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={cn(
      'inline-flex items-center font-semibold border rounded-md',
      size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
      config.cls
    )}>
      {config.label}
    </span>
  );
}