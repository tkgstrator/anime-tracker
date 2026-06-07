import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Input } from './ui/input'

export function GlobalSearchBar() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isModK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
      if (!isModK) return
      event.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = value.trim()
    if (trimmed.length === 0) return
    navigate({ to: '/browse', search: { q: trimmed } })
    inputRef.current?.blur()
  }

  return (
    <search className='max-w-md flex-1'>
      <form onSubmit={onSubmit} className='relative'>
        <Search className='pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          ref={inputRef}
          type='search'
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder='タイトル検索'
          aria-label='タイトル検索'
          className='h-9 pl-8 pr-14'
        />
        <kbd className='pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 select-none rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground'>
          ⌘K
        </kbd>
      </form>
    </search>
  )
}
