import { type ReactNode, useEffect, useRef } from 'react'

export interface Column<T> {
  key: string
  label: string
  width?: string
  sortable?: boolean
  render?: (row: T) => ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  onSort?: (key: string) => void
  selectedKeys?: Set<string>
  onSelectChange?: (keys: Set<string>) => void
  loading?: boolean
  emptyLabel?: string
}

function SortIcon({ dir }: { dir?: 'asc' | 'desc' }) {
  return (
    <svg className="size-4 text-icon-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {dir === 'asc'  && <path d="m18 15-6-6-6 6" />}
      {dir === 'desc' && <path d="m6 9 6 6 6-6" />}
      {!dir           && <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />}
    </svg>
  )
}

function HeaderCheckbox({ allSelected, someSelected, onToggle }: {
  allSelected: boolean
  someSelected: boolean
  onToggle: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someSelected && !allSelected
  }, [someSelected, allSelected])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      onChange={onToggle}
      className="size-4 rounded accent-brand cursor-pointer translate-y-1"
      aria-label="전체 선택"
    />
  )
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  sortKey,
  sortDir,
  onSort,
  selectedKeys,
  onSelectChange,
  loading = false,
  emptyLabel = '데이터가 없습니다.',
}: DataTableProps<T>) {
  const hasSelection = selectedKeys !== undefined && onSelectChange !== undefined

  // Compute keys once per render — avoid double-calling rowKey in both allKeys and render loop
  const rowEntries = rows.map(row => ({ row, key: rowKey(row) }))
  const allKeys = rowEntries.map(e => e.key)
  const allSelected = allKeys.length > 0 && allKeys.every(k => selectedKeys?.has(k))
  const someSelected = allKeys.some(k => selectedKeys?.has(k))

  function toggleAll() {
    if (!onSelectChange) return
    onSelectChange(allSelected ? new Set() : new Set(allKeys))
  }

  function toggleRow(key: string) {
    if (!onSelectChange || !selectedKeys) return
    const next = new Set(selectedKeys)
    if (next.has(key)) { next.delete(key) } else { next.add(key) }
    onSelectChange(next)
  }

  const colSpan = columns.length + (hasSelection ? 1 : 0)

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border-subtle bg-surface-raised shadow-card">
      <table className="w-full text-left text-body-sm">
        <thead>
          <tr className="border-b border-border-subtle bg-surface-sunken">
            {hasSelection && (
              <th className="w-10 px-3 py-2.5">
                <HeaderCheckbox
                  allSelected={allSelected}
                  someSelected={someSelected}
                  onToggle={toggleAll}
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                className={[
                  'px-3 py-2.5 text-label font-semibold text-text-secondary whitespace-nowrap',
                  col.sortable ? 'cursor-pointer select-none hover:text-text-primary' : '',
                ].join(' ')}
                style={col.width ? { width: col.width } : undefined}
                onClick={() => col.sortable && onSort?.(col.key)}
                aria-sort={
                  sortKey === col.key
                    ? sortDir === 'asc' ? 'ascending' : 'descending'
                    : col.sortable ? 'none' : undefined
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  {col.label}
                  {col.sortable && <SortIcon dir={sortKey === col.key ? sortDir : undefined} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={colSpan} className="px-3 py-8 text-center text-text-tertiary">
                <span className="inline-block size-5 rounded-full border-2 border-brand border-t-transparent animate-spin" aria-label="로딩 중" />
              </td>
            </tr>
          )}
          {!loading && rowEntries.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="px-3 py-8 text-center text-text-tertiary text-body-sm">
                {emptyLabel}
              </td>
            </tr>
          )}
          {!loading && rowEntries.map(({ row, key }) => {
            const isSelected = selectedKeys?.has(key) ?? false
            return (
              <tr
                key={key}
                className={[
                  'border-b border-border-subtle last:border-0 transition-colors',
                  isSelected ? 'bg-surface-selected' : 'hover:bg-surface-hover',
                ].join(' ')}
                aria-selected={hasSelection ? isSelected : undefined}
              >
                {hasSelection && (
                  <td className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(key)}
                      className="size-4 rounded accent-brand cursor-pointer translate-y-1"
                      aria-label="행 선택"
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2.5 text-text-primary whitespace-nowrap">
                    {col.render
                      ? col.render(row)
                      : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
