import { Check } from 'lucide-react'
import { FilterChip } from '@/shared/components/FilterChip'
import type { SnsSearchSort } from '../sns.queries'

const SORTS: { value: SnsSearchSort; label: string }[] = [
  { value: 'POPULAR', label: '인기순' },
  { value: 'LATEST', label: '최신순' },
]

// 게시물 검색과 해시태그 게시물 목록의 정렬 칩(b12-st-4 4-A, b7-st-6 6-D). 관련성순은 인기순으로 대신한다(A6).
export function SnsSortChips({ sort, onChange }: { sort: SnsSearchSort; onChange: (sort: SnsSearchSort) => void }) {
  return (
    <div className="flex flex-none gap-1.5">
      {SORTS.map(option => (
        <FilterChip key={option.value} size="sm" selected={option.value === sort} onClick={() => onChange(option.value)}>
          {option.value === sort && <Check className="mr-1 size-3" />}
          {option.label}
        </FilterChip>
      ))}
    </div>
  )
}
