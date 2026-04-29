import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export default function DataTable({ columns, data, loading, emptyIcon: EmptyIcon, emptyText, onRowClick }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {columns.map(col => (
              <th key={col.key} className={cn(
                'text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap',
                col.className
              )}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading ? (
            Array(6).fill(0).map((_, i) => (
              <tr key={i}>
                {columns.map((col, j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="h-4 bg-muted rounded animate-pulse" style={{ width: col.loadWidth || '80%' }} />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-16 text-center text-muted-foreground">
                {EmptyIcon && <EmptyIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />}
                <p className="text-sm">{emptyText || 'No records found.'}</p>
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={row.id || i}
                className={cn('hover:bg-muted/20 transition-colors', onRowClick && 'cursor-pointer')}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(col => (
                  <td key={col.key} className={cn('px-4 py-3', col.cellClassName)}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}