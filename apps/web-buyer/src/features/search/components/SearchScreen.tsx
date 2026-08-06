import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Clock, X } from 'lucide-react'
import { MobileScreen, SearchInput } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useIsLoggedIn } from '@/shared/auth'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  useDeleteAllRecentKeywords,
  useDeleteRecentKeyword,
  useSearchLanding,
} from '../search.queries'

// 검색 입력/최근 검색어(b3-st-2). 로그인 사용자는 서버의 최근·추천 검색어를 조회하고,
// 최근 검색어 삭제는 optimistic cache update 뒤 실제 DELETE API로 확정한다.
export function SearchScreen() {
  const navigate = useNavigate()
  const isLoggedIn = useIsLoggedIn()
  const { data } = useSearchLanding(isLoggedIn)
  const deleteOne = useDeleteRecentKeyword()
  const deleteAll = useDeleteAllRecentKeywords()

  const [query, setQuery] = useState('')
  const recent = data?.recentKeywords ?? []

  const submit = (keyword: string) => {
    const q = keyword.trim()
    if (!q) return
    navigate({ to: '/search/results', search: { q } })
  }

  const goBack = useSafeBack({ to: '/' })

  return (
    <MobileScreen
      header={
        <BackAppBar onBack={goBack}>
          <SearchInput
            value={query}
            onChange={setQuery}
            onClear={() => setQuery('')}
            placeholder="상품, 브랜드 검색"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') submit(query)
            }}
          />
        </BackAppBar>
      }
    >
      <div className="flex flex-col gap-6 p-4">
        {/* 최근 검색어 */}
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-label font-semibold text-text-primary">최근 검색어</span>
            {recent.length > 0 && (
              <button
                type="button"
                onClick={() => deleteAll.mutate()}
                className="text-caption text-text-tertiary"
              >
                전체 삭제
              </button>
            )}
          </div>
          {recent.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {recent.map(item => (
                <span
                  key={item.id}
                  className="inline-flex h-8 items-center rounded-chip border border-border bg-surface-base pl-3.5 pr-1 text-body-sm text-text-secondary"
                >
                  <button
                    type="button"
                    onClick={() => submit(item.keyword)}
                    className="max-w-[160px] truncate"
                  >
                    {item.keyword}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteOne.mutate(item.id)}
                    aria-label={`${item.keyword} 삭제`}
                    className="ml-1 flex size-6 items-center justify-center text-icon-muted"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-card border border-border-subtle bg-surface-raised px-4 py-6">
              <Clock className="size-6 text-icon-muted" />
              <span className="text-body-sm text-text-tertiary">
                최근 검색한 상품이 여기에 표시돼요
              </span>
            </div>
          )}
        </section>

        {/* 추천 검색어 */}
        <section className="flex flex-col gap-2.5">
          <span className="text-label font-semibold text-text-primary">추천 검색어</span>
          <div className="flex flex-wrap gap-2">
            {(data?.suggestedKeywords ?? []).map(keyword => (
              <button
                key={keyword}
                type="button"
                onClick={() => submit(keyword)}
                className="inline-flex h-8 items-center rounded-chip bg-surface-sunken px-3.5 text-body-sm text-text-secondary"
              >
                {keyword}
              </button>
            ))}
          </div>
        </section>
      </div>
    </MobileScreen>
  )
}
