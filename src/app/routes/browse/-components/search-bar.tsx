import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/app/components/ui/input'

export function SearchBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [localValue, setLocalValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleChange = (v: string) => {
    setLocalValue(v)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onChange(v), 300)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className='relative'>
      <Search className='pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
      <Input
        type='search'
        placeholder='タイトル検索...'
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        className='h-9 pl-9 md:text-base'
        aria-label='タイトル検索'
      />
    </div>
  )
}
