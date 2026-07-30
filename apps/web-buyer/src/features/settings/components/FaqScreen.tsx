import { useMemo, useState } from 'react'
import { SearchX } from 'lucide-react'
import { Accordion, EmptyState, MobileScreen, SearchInput } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { FAQ_CATEGORIES, FAQ_ITEMS, filterFaq, type FaqCategory } from '../settings.mock'

// 자주 묻는 질문(b11-st-5). 검색 + 카테고리 칩 필터가 실제로 아코디언 목록을 좁힌다.
// 결과가 없으면 5-B 빈 상태를 보여준다. 고객센터 문의(b6-st-3)는 앱에 없어 안내 문구도 두지 않는다.
export function FaqScreen() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<FaqCategory>('all')
  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    const first = FAQ_ITEMS[0]
    return first ? [first.id] : []
  })

  const goBack = useSafeBack({ to: '/settings' })

  const results = useMemo(() => filterFaq(FAQ_ITEMS, category, query), [category, query])

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
          {FAQ_CATEGORIES.map(cat => {
            const active = cat.value === category
            return (
              <button
                key={cat.value}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(cat.value)}
                className={[
                  'h-8 flex-none rounded-chip border px-3 text-body-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-border',
                  active
                    ? 'border-brand-border bg-brand-subtle font-semibold text-brand'
                    : 'border-border bg-surface-base text-text-secondary',
                ].join(' ')}
              >
                {cat.label}
              </button>
            )
          })}
        </div>

        <div className="h-px bg-border-subtle" />

        {results.length > 0 ? (
          <Accordion
            className="px-4"
            items={results.map(item => ({ key: item.id, title: item.question, content: item.answer }))}
            openKeys={openKeys}
            onChange={setOpenKeys}
          />
        ) : (
          <div className="flex flex-col items-center px-6 py-12">
            <EmptyState
              icon={<SearchX className="size-7" />}
              title="검색 결과가 없어요"
              description={
                query.trim() !== ''
                  ? `${query.trim()} 검색 결과가 없어요. 다른 키워드로 검색해 주세요.`
                  : '해당 카테고리에 등록된 질문이 없어요.'
              }
            />
          </div>
        )}
      </div>
    </MobileScreen>
  )
}
