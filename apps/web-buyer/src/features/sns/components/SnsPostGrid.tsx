import type { ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { UseInfiniteQueryResult } from '@tanstack/react-query'
import { Copy, Play } from 'lucide-react'
import { EmptyState, Skeleton } from '@aechak/design-system/web'
import type { SnsGridItem } from '../sns.queries'
import { SnsListEnd, SnsListError, SnsRefetchError } from './SnsListEnd'

export interface SnsPostTabItem<K extends string> {
  key: K
  label: string
  icon: ReactNode
}

// 프로필 게시물 탭(b7-st-4). 아이콘 탭이고 이름은 화면 읽기 프로그램용이다(SNS-01 F5). DS Tabs는 글자 라벨만 받아
// feature 안에 둔다.
export function SnsPostTabs<K extends string>({
  tabs,
  activeKey,
  onSelect,
}: {
  tabs: SnsPostTabItem<K>[]
  activeKey: K
  onSelect: (key: K) => void
}) {
  return (
    <div role="tablist" aria-label="게시물 목록" className="flex border-t border-border-subtle">
      {tabs.map(tab => {
        const selected = tab.key === activeKey
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={tab.label}
            onClick={() => onSelect(tab.key)}
            className={`flex h-11 flex-1 items-center justify-center border-b-2 focus-visible:outline-none focus-visible:shadow-focus-ring ${
              selected ? 'border-brand text-text-brand' : 'border-transparent text-icon-muted'
            }`}
          >
            {tab.icon}
          </button>
        )
      })}
    </div>
  )
}

function GridSkeleton() {
  return (
    <div role="status" aria-label="게시물을 불러오는 중" className="grid grid-cols-3 gap-0.5">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="aspect-square w-full" />
      ))}
    </div>
  )
}

// 칸 이름. 사진과 영상은 종류와 장수, 텍스트 게시물은 본문 앞부분이다.
function cellLabel(item: SnsGridItem): string {
  if (item.mediaType === 'VIDEO') return '영상 게시물'
  if (item.mediaType === 'PHOTO') return item.photoCount >= 2 ? `사진 ${item.photoCount}장 게시물` : '사진 게시물'
  return item.captionPreview ?? '게시물'
}

interface SnsPostGridProps {
  grid: UseInfiniteQueryResult<SnsGridItem[], unknown>
  empty: string
  /** 그리드와 영상 탭처럼 칸의 작성자가 목록 주인이면 상세로 넘긴다(내가 차단한 작성자 안내의 프로필 이동) */
  author?: string
}

// 프로필 탭과 저장됨 탭의 칸 목록(design 6절 9번). 칸은 썸네일이나 텍스트 게시물의 본문 앞부분을 그리고 사진이 여러 장이면
// copy, 영상이면 play 아이콘을 올린다. 누르면 상세다. 첫 로딩은 스켈레톤 칸이고 이어 불러오기와 실패 처리는 피드와 같다.
export function SnsPostGrid({ grid, empty, author }: SnsPostGridProps) {
  const navigate = useNavigate()
  if (grid.isPending) return <GridSkeleton />
  if (!grid.data) return <SnsListError onRetry={() => void grid.refetch()} />
  // 다시 읽기가 실패해도 받아 둔 칸은 두고 위에 알린다.
  const refetchError = grid.isRefetchError && <SnsRefetchError onRetry={() => void grid.refetch()} />
  // 받아 둔 칸을 모두 뺐어도 다음 페이지가 남았으면 빈 안내 대신 목록 끝을 두어 이어 부른다.
  if (grid.data.length === 0 && !grid.hasNextPage) {
    return (
      <>
        {refetchError}
        <div className="py-10">
          <EmptyState title={empty} />
        </div>
      </>
    )
  }
  return (
    <>
      {refetchError}
      <ul aria-label="게시물" className="grid grid-cols-3 gap-0.5">
        {grid.data.map(item => (
          <li key={item.publicId}>
            <button
              type="button"
              aria-label={cellLabel(item)}
              onClick={() =>
                navigate({
                  to: '/sns/posts/$publicId',
                  params: { publicId: item.publicId },
                  search: author ? { author } : {},
                })
              }
              className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-surface-sunken focus-visible:outline-none focus-visible:shadow-focus-ring"
            >
              {item.thumbnailUrl ? (
                <img src={item.thumbnailUrl} alt="" className="size-full object-cover" />
              ) : (
                <span className="line-clamp-4 break-words px-2 text-left text-caption text-text-secondary">
                  {item.captionPreview}
                </span>
              )}
              {item.mediaType === 'VIDEO' ? (
                <Play className="absolute right-1.5 top-1.5 size-4 fill-current text-white drop-shadow" />
              ) : (
                item.photoCount >= 2 && (
                  <Copy className="absolute right-1.5 top-1.5 size-4 text-white drop-shadow" />
                )
              )}
            </button>
          </li>
        ))}
      </ul>
      <SnsListEnd
        hasNextPage={grid.hasNextPage}
        isFetchingNextPage={grid.isFetchingNextPage}
        isFetchNextPageError={grid.isFetchNextPageError}
        fetchNextPage={grid.fetchNextPage}
      />
    </>
  )
}
