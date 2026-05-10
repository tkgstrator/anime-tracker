import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover'

export function FilterPopover<T extends string | number | boolean | undefined>({
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
  const isActive = value != null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            size='lg'
            variant={isActive ? 'default' : 'ghost'}
            className={isActive ? 'bg-accent text-accent-foreground hover:bg-accent/85' : 'text-muted-foreground'}
          />
        }
      >
        <span>{isActive ? (selected?.label ?? 'すべて') : label}</span>
        <ChevronDown data-icon='inline-end' className='opacity-60' />
      </PopoverTrigger>
      <PopoverContent align='start' className='w-44 p-1.5'>
        {options.map((opt) => {
          const checked = value === opt.value
          return (
            <button
              key={String(opt.value ?? 'all')}
              type='button'
              role='menuitemradio'
              aria-checked={checked}
              onClick={() => {
                onSelect(opt.value)
                setOpen(false)
              }}
              className='flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted aria-checked:font-medium aria-checked:text-accent-foreground'
            >
              <Check className={`size-3.5 shrink-0 ${checked ? 'opacity-100' : 'opacity-0'}`} />
              <span>{opt.label}</span>
            </button>
          )
        })}
      </PopoverContent>
    </Popover>
  )
}
