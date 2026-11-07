import { MobileScreen, Skeleton, StatusPill } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  formatNoticeDateTime,
  noticeCategoryMeta,
  noticeDetailErrorMessage,
} from '../notices.map'
import { useNoticeDetail } from '../notices.queries'

/**
 * 공지 전문(SCRUM-332).
 *
 * 목록 응답에 `content`가 없어(앞 100자 미리보기뿐) 이 화면이 상세 경로를 따로 부른다 —
 * 목록 행으로 그리면 잘린 글이 공지 전문으로 읽힌다.
 *
 * 404(150000)는 초안·내린 공지·구매자 대상이 아닌 공지를 **한 코드로** 끊으므로 문구도 사유를
 * 단정하지 않는다.
 */
export function NoticeDetailScreen({ noticeId }: { noticeId: string }) {
  const goBack = useSafeBack({ to: '/settings/notices' })
  const detail = useNoticeDetail(noticeId)
  const meta = detail.notice ? noticeCategoryMeta(detail.notice.category) : null

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="공지사항" />}>
      {detail.isLoading ? (
        <div className="flex flex-col gap-3 p-4">
          <Skeleton variant="text" className="w-2/3" />
          <Skeleton variant="rect" className="h-40 w-full" />
        </div>
      ) : detail.isError || detail.notice == null || meta == null ? (
        // 로딩·실패를 삼키면 빈 화면이 "내용 없는 공지"처럼 보인다.
        <ScreenEmptyState
          title="지금은 볼 수 없는 공지예요"
          description={noticeDetailErrorMessage(detail.error)}
          action={{ label: '다시 시도', onClick: detail.refetch }}
        />
      ) : (
        <article className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-1.5">
            {/* 서버 정렬의 첫 키가 pinned이라 중요 공지가 목록 맨 위에 온다 — 상세에서도 같은
                글자로 말해 목록과 어긋나지 않게 한다. */}
            {detail.notice.pinned && (
              <StatusPill variant="warning" size="sm">
                중요
              </StatusPill>
            )}
            <StatusPill variant={meta.variant} size="sm">
              {meta.label}
            </StatusPill>
          </div>

          <h1 className="text-subheading font-semibold text-text-primary">{detail.notice.title}</h1>
          <p className="text-caption text-text-tertiary">
            {formatNoticeDateTime(detail.notice.publishedAt)} 게시
          </p>

          {/* 전문은 평탄화되지 않은 원문이라 줄바꿈을 그대로 살린다. */}
          <p className="whitespace-pre-wrap text-body-sm leading-relaxed text-text-primary">
            {detail.notice.content}
          </p>
        </article>
      )}
    </MobileScreen>
  )
}
