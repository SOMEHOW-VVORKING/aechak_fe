import { useEffect, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Clock, Minus, TrendingDown, TrendingUp, X } from 'lucide-react'
import { MobileScreen, SearchInput } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSearchLanding } from '../search.queries'
import type { KeywordTrend } from '../search.mock'

// 검색 입력/최근 검색어(b3-st-2). 최근 검색어는 랜딩 데이터로 시드한 뒤 로컬에서 삭제/전체삭제한다
// — 있음/없음 두 상태(2-A/2-B)가 실제 동작으로 전환된다.
export function SearchScreen() {
  const navigate = useNavigate()
  const router = useRouter()
  const { data } = useSearchLanding()

  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    if (data && !seeded) {
      setRecent(data.recentKeywords)
      setSeeded(true)
    }
  }, [data, seeded])

  const submit = (keyword: string) => {
    const q = keyword.trim()
    if (!q) return
    navigate({ to: '/search/results', search: { q } })
  }

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/' })
  }

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
                onClick={() => setRecent([])}
                className="text-caption text-text-tertiary"
              >
                전체 삭제
              </button>
            )}
          </div>
          {recent.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {recent.map(keyword => (
                <span
                  key={keyword}
                  className="inline-flex h-8 items-center rounded-chip border border-border bg-surface-base pl-3.5 pr-1 text-body-sm text-text-secondary"
                >
                  <button type="button" onClick={() => submit(keyword)} className="max-w-[160px] truncate">
                    {keyword}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecent(prev => prev.filter(k => k !== keyword))}
                    aria-label={`${keyword} 삭제`}
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
              <span className="text-body-sm text-text-tertiary">최근 검색한 상품이 여기에 표시돼요</span>
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

        {/* 인기 검색어 */}
        <section className="flex flex-col">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-label font-semibold text-text-primary">인기 검색어</span>
            <span className="text-caption text-text-tertiary">{data?.popularAsOf}</span>
          </div>
          {(data?.popularKeywords ?? []).map((item, i, arr) => (
            <button
              key={item.keyword}
              type="button"
              onClick={() => submit(item.keyword)}
              className={[
                'flex items-center gap-3 py-3 text-left',
                i < arr.length - 1 ? 'border-b border-border-subtle' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'w-4 flex-none text-body-sm font-bold',
                  item.rank <= 2 ? 'text-brand' : 'text-text-tertiary',
                ].join(' ')}
              >
                {item.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">{item.keyword}</span>
              <TrendIcon trend={item.trend} />
            </button>
          ))}
        </section>
      </div>
    </MobileScreen>
  )
}

function TrendIcon({ trend }: { trend: KeywordTrend }) {
  if (trend === 'up') return <TrendingUp className="size-4 flex-none text-success-fg" />
  if (trend === 'down') return <TrendingDown className="size-4 flex-none text-icon-muted" />
  return <Minus className="size-4 flex-none text-icon-muted" />
}
