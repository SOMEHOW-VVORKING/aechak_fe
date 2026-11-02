import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Clock, X } from 'lucide-react'
import { Card, MobileScreen, SearchInput } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSessionState } from '@/shared/auth'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  useDeleteAllRecentKeywords,
  useDeleteRecentKeyword,
  useSearchLanding,
} from '../search.queries'
import { KeywordChip } from './KeywordChip'

// 검색 입력/최근 검색어(b3-st-2). 로그인 사용자는 서버의 최근·추천 검색어를 조회하고,
// 최근 검색어 삭제는 optimistic cache update 뒤 실제 DELETE API로 확정한다.
export function SearchScreen() {
  const navigate = useNavigate()
  const sessionState = useSessionState()
  const isLoggedIn = sessionState === 'member'
  const { data } = useSearchLanding(isLoggedIn)
  const deleteOne = useDeleteRecentKeyword()
  const deleteAll = useDeleteAllRecentKeywords()

  const [query, setQuery] = useState('')
  const recent = data?.recentKeywords ?? []
  const suggested = data?.suggestedKeywords ?? []

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
            <Card className="flex flex-col items-center gap-2 px-4 py-6">
              <Clock className="size-6 text-icon-muted" />
              {/* 최근·추천 검색어(GET /search/keywords)는 회원 전용이다. 비회원에게 "여기에
                  표시돼요"라고 적으면 저장되지 않는 것을 저장될 것처럼 읽게 된다. 반대로 세션
                  확인이 끝나지 않은 'unknown'에 로그인을 권하면 회원에게 거짓을 읽힌다. */}
              <span className="text-body-sm text-text-tertiary">
                {sessionState === 'guest'
                  ? '로그인하면 최근 검색어를 저장해 드려요'
                  : '최근 검색한 상품이 여기에 표시돼요'}
              </span>
            </Card>
          )}
        </section>

        {/* 추천 검색어 — 비어 있으면(비회원·서버 무응답) 제목만 남은 빈 칸이 되므로 섹션을 접는다. */}
        {suggested.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <span className="text-label font-semibold text-text-primary">추천 검색어</span>
            <div className="flex flex-wrap gap-2">
              {suggested.map(keyword => (
                <KeywordChip key={keyword} keyword={keyword} onClick={() => submit(keyword)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </MobileScreen>
  )
}
