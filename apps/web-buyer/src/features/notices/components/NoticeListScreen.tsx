import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Alert, Card, MobileScreen, Skeleton, StatusPill } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { FilterChip } from '@/shared/components/FilterChip'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  formatNoticeDateTime,
  noticeCategoryMeta,
  noticeListErrorMessage,
  NOTICE_CATEGORIES,
  NOTICE_CATEGORY_LABEL,
  type NoticeSummary,
} from '../notices.map'
import { CATEGORY_ANY, useNotices, type NoticeCategoryFilter } from '../notices.queries'

/**
 * 공지사항 목록(SCRUM-332). 어드민이 게시한 공지 중 대상이 전체·구매자인 것만 내려온다.
 *
 * 설정 홈 '고객지원' 그룹에서 들어온다 — 그 자리가 입구가 없으면 운영자가 공지를 올려도 구매자는
 * 닿을 길이 없다.
 *
 * **읽음/안 읽음 표기와 발송 안내를 두지 않는다.** 열람 기록 테이블도 푸시 발송 경로도 플랫폼에
 * 없어서 응답에 그 필드가 없다 — 자리를 만들면 안 읽음 표시가 영구히 안 바뀌거나 "알림으로 보냈다"는
 * 거짓을 읽힌다.
 */
export function NoticeListScreen() {
  const [category, setCategory] = useState<NoticeCategoryFilter>(CATEGORY_ANY)
  const navigate = useNavigate()
  const goBack = useSafeBack({ to: '/settings' })
  const list = useNotices(category)

  const openNotice = (noticeId: string) =>
    void navigate({ to: '/settings/notices/$noticeId', params: { noticeId } })

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="공지사항" />}>
      <div className="flex flex-col">
        {/* 분류 칩. 필터를 바꾸면 쿼리 키가 갈려 커서 사슬이 처음부터 다시 시작한다
            (커서에 분류가 실리지 않아 서버가 끊어 주지 않는다 — notices.queries 주석). */}
        <div
          className="flex gap-2 overflow-x-auto px-4 pt-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="group"
          aria-label="공지 분류"
        >
          <FilterChip
            size="sm"
            selected={category === CATEGORY_ANY}
            onClick={() => setCategory(CATEGORY_ANY)}
          >
            전체
          </FilterChip>
          {NOTICE_CATEGORIES.map(value => (
            <FilterChip
              key={value}
              size="sm"
              selected={category === value}
              onClick={() => setCategory(value)}
            >
              {NOTICE_CATEGORY_LABEL[value]}
            </FilterChip>
          ))}
        </div>

        {list.isLoading ? (
          <div className="flex flex-col gap-3 px-4 pb-4">
            {[0, 1, 2].map(i => (
              <Skeleton key={i} variant="rect" className="h-24 w-full" />
            ))}
          </div>
        ) : list.isError && list.notices.length === 0 ? (
          // "공지가 없음"과 "불러오지 못함"을 가른다(AGENTS 6절 7항).
          <ScreenEmptyState
            title="공지를 불러오지 못했어요"
            description={noticeListErrorMessage(list.error)}
            action={{ label: '다시 시도', onClick: list.refetch }}
          />
        ) : list.notices.length === 0 ? (
          <ScreenEmptyState
            title="등록된 공지가 없어요"
            description="새 공지가 올라오면 여기에서 볼 수 있어요."
          />
        ) : (
          <div className="flex flex-col gap-3 px-4 pb-4">
            {/* 재조회가 실패하면 직전 목록이 그대로 남는다 — 지금 내용이 아니라는 사실을 밝힌다. */}
            {list.isError && (
              <Alert variant="error" title="공지를 새로 불러오지 못했어요">
                <p>
                  {noticeListErrorMessage(list.error)} 아래 목록은 마지막으로 불러온 내용이라 지금과
                  다를 수 있어요.
                </p>
              </Alert>
            )}

            {/* 총건수는 첫 페이지에만 실린다 — 커서 페이지의 null로 덮으면 숫자가 사라지므로
                첫 페이지 값만 붙든다. 받지 못한 동안에는 숫자를 지어내지 않고 줄을 비운다. */}
            {list.totalCount != null && (
              <p className="text-body-sm text-text-secondary">
                전체 {list.totalCount.toLocaleString('ko-KR')}건
              </p>
            )}

            {list.notices.map(notice => (
              <NoticeCard key={notice.noticeId} notice={notice} onClick={openNotice} />
            ))}

            {list.hasNextPage && (
              <button
                type="button"
                onClick={list.fetchNextPage}
                disabled={list.isFetchingNextPage}
                className="h-11 w-full rounded-button border border-border bg-surface-base text-body-sm font-medium text-text-secondary transition-colors disabled:opacity-60"
              >
                {list.isFetchingNextPage ? '불러오는 중…' : '더보기'}
              </button>
            )}

            <p className="text-caption text-text-tertiary">
              중요 공지가 먼저 오고 그 다음 최근 게시순이에요.
            </p>
          </div>
        )}
      </div>
    </MobileScreen>
  )
}

/**
 * 공지 한 건의 요약 카드.
 *
 * `pinned`는 서버 정렬의 첫 키라 중요 공지가 늘 맨 위다 — 게시 시각만 보여 주면 눈에 보이는
 * 순서와 어긋난다. 색이 아니라 글자로 말한다.
 *
 * 미리보기는 앞 100자뿐이라 **전문이 아니다** — 카드를 눌러 상세를 불러야 전문이 온다.
 */
function NoticeCard({
  notice,
  onClick,
}: {
  notice: NoticeSummary
  onClick: (noticeId: string) => void
}) {
  // 구조분해라 표에 없는 분류가 오면 여기서 터진다 — `noticeCategoryMeta`가 그 자리를 막는다.
  const { label, variant } = noticeCategoryMeta(notice.category)

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => onClick(notice.noticeId)}
        className="flex w-full flex-col items-start gap-1.5 p-4 text-left transition-colors active:bg-surface-hover focus-visible:outline-none focus-visible:shadow-focus-ring"
      >
        <span className="flex items-center gap-1.5">
          {notice.pinned && (
            <StatusPill variant="warning" size="sm">
              중요
            </StatusPill>
          )}
          <StatusPill variant={variant} size="sm">
            {label}
          </StatusPill>
        </span>
        <span className="text-label font-semibold text-text-primary">{notice.title}</span>
        <span className="line-clamp-2 text-body-sm leading-relaxed text-text-secondary">
          {notice.contentPreview}
        </span>
        <span className="text-caption text-text-tertiary">
          {formatNoticeDateTime(notice.publishedAt)}
        </span>
      </button>
    </Card>
  )
}
