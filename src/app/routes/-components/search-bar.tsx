import { Search } from 'lucide-react'

export function SearchBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className='relative'>
      <Search className='absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
      <input
        type='text'
        placeholder='タイトル検索...'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className='h-9 w-full rounded-lg bg-muted pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-indigo-500/30'
      />
    </div>
  )
}
