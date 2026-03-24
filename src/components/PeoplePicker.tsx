import { useState, useRef, useEffect } from 'react'
import type { PersonEntity } from '@/types/entities'

interface PeoplePickerProps {
  people: PersonEntity[]
  selected: string[]  // person names
  onChange: (names: string[]) => void
  onAddNew: (name: string) => void
}

export function PeoplePicker({ people, selected, onChange, onAddNew }: PeoplePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setAddingNew(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const unselected = people.filter((p) => !selected.includes(p.name))
  const filtered = search.trim()
    ? unselected.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : unselected

  const handleRemove = (name: string) => {
    onChange(selected.filter((n) => n !== name))
  }

  const handleSelect = (name: string) => {
    onChange([...selected, name])
    setSearch('')
  }

  const handleAddNew = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    onAddNew(trimmed)
    onChange([...selected, trimmed])
    setNewName('')
    setAddingNew(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected chips + trigger */}
      <div
        className="flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-md border border-gray-300 px-2 py-1.5 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 cursor-text"
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        {selected.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800"
          >
            {name}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleRemove(name) }}
              className="ml-0.5 text-blue-500 hover:text-blue-700"
            >
              x
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? '+ Add person' : ''}
          className="flex-1 min-w-[80px] border-none bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-48 overflow-auto">
          {filtered.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => handleSelect(person.name)}
              className="w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-blue-50"
            >
              {person.name}
              {person.role && (
                <span className="ml-2 text-xs text-gray-400">{person.role}</span>
              )}
            </button>
          ))}

          {filtered.length === 0 && !addingNew && (
            <p className="px-3 py-2 text-xs text-gray-400">No matching people</p>
          )}

          {/* Add new person */}
          <div className="border-t border-gray-100">
            {!addingNew ? (
              <button
                type="button"
                onClick={() => { setAddingNew(true); setSearch('') }}
                className="w-full px-3 py-1.5 text-left text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                + Add new person
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddNew() }}
                  placeholder="Name"
                  autoFocus
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddNew}
                  disabled={!newName.trim()}
                  className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
