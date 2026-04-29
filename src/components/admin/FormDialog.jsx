import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export default function FormDialog({ open, onOpenChange, title, fields, form, onChange, onSave, onDelete, saving, editing }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${title}` : `New ${title}`}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
          {fields.map(field => (
            <div key={field.key} className={field.fullWidth ? 'sm:col-span-2' : ''}>
              <Label className="text-xs font-medium mb-1.5 block">
                {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
              </Label>

              {field.type === 'textarea' ? (
                <Textarea
                  value={form[field.key] ?? ''}
                  onChange={e => onChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="text-sm resize-none h-20"
                />
              ) : field.type === 'select' ? (
                <Select value={form[field.key] ?? ''} onValueChange={v => onChange(field.key, v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
                  <SelectContent>
                    {field.options.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={field.type || 'text'}
                  value={form[field.key] ?? ''}
                  onChange={e => onChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="h-8 text-sm"
                  step={field.step}
                />
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 flex-row">
          {editing && onDelete && (
            <Button variant="destructive" size="sm" onClick={onDelete} disabled={saving} className="mr-auto">
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}