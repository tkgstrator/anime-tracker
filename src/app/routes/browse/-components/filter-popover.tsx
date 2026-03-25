import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover'

export function FilterPopover<T extends string | number | undefined>({
  label,
  value,
  options,
  onSelect
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onSelect: (value: T) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors ${
          value != null
            ? 'bg-indigo-500/10 font-medium text-indigo-700'
            : 'bg-muted text-muted-foreground hover:bg-muted/80'
        }`}
      >
        <span className='text-muted-foreground'>{label}:</span>
        <span>{selected?.label ?? 'すべて'}</span>
      </PopoverTrigger>
      <PopoverContent align='start' className='w-40 p-1'>
        {options.map((opt) => (
          <button
            key={String(opt.value ?? 'all')}
            type='button'
            onClick={() => {
              onSelect(opt.value)
              setOpen(false)
            }}
            className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
              value === opt.value ? 'bg-indigo-500/10 font-medium text-indigo-700' : 'text-foreground hover:bg-muted'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
