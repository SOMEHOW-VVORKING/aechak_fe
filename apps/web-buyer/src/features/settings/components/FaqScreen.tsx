import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { SearchX } from 'lucide-react'
import { Accordion, EmptyState, MobileScreen, SearchInput } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { Divider } from '@/shared/components/Divider'
import { FilterChip } from '@/shared/components/FilterChip'
import { useSafeBack } from '@/shared/useSafeBack'
import { FAQ_CATEGORIES, FAQ_ITEMS, filterFaq, type FaqCategory } from '../settings.mock'

// 자주 묻는 질문(b11-st-5). 검색 + 카테고리 칩 필터가 실제로 아코디언 목록을 좁힌다.
// 결과가 없으면 5-B 빈 상태를 보여준다. 답변을 못 찾으면 하단 CTA/빈 상태에서 고객센터 문의
// (b6-st-3, SCRUM-189)로 이동한다.
export function FaqScreen() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<FaqCategory>('all')
  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    const first = FAQ_ITEMS[0]
    return first ? [first.id] : []
  })

  const navigate = useNavigate()
  const goBack = useSafeBack({ to: '/settings' })

  const results = useMemo(() => filterFaq(FAQ_ITEMS, category, query), [category, query])
  const keyword = query.trim()

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="자주 묻는 질문" />}>
      <div className="flex flex-col">
        {/* 검색 */}
        <div className="px-4 pt-3 pb-2">
          <SearchInput value={query} onChange={setQuery} placeholder="궁금한 내용을 검색하세요" />
        </div>

        {/* 카테고리 칩 (단일 선택) */}
        <div
          className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="FAQ 카테고리"
        >
          {FAQ_CATEGORIES.map(cat => (
            <FilterChip
              key={cat.value}
              size="sm"
              selected={cat.value === category}
              onClick={() => setCategory(cat.value)}
            >
              {cat.label}
            </FilterChip>
          ))}
        </div>

        <Divider />

        {results.length > 0 ? (
          <>
            <Accordion
              className="px-4"
              items={results.map(item => ({ key: item.id, title: item.question, content: item.answer }))}
              openKeys={openKeys}
              onChange={setOpenKeys}
            />
            {/* 답을 못 찾은 사용자를 고객센터 문의로 안내(목업 b11-st-5 하단 문의하기) */}
            <div className="px-4 py-6">
              <button
                type="button"
                onClick={() => navigate({ to: '/settings/inquiry' })}
                className="flex w-full items-center justify-center rounded-input border border-border bg-surface-raised py-3 text-body-sm text-text-secondary transition-colors hover:bg-surface-hover"
              >
                원하는 답변을 찾지 못하셨나요? 고객센터 문의
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center px-6 py-12">
            <EmptyState
              icon={<SearchX className="size-7" />}
              title="검색 결과가 없어요"
              description={
                keyword !== ''
                  ? `${keyword} 검색 결과가 없어요. 다른 키워드로 검색해 주세요.`
                  : '해당 카테고리에 등록된 질문이 없어요.'
              }
              action={{ label: '고객센터 문의', onClick: () => navigate({ to: '/settings/inquiry' }) }}
            />
          </div>
        )}
      </div>
    </MobileScreen>
  )
}
