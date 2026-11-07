import { Alert, Button, Drawer, StatusPill } from '@aechak/design-system/web'
import {
  formatNoticeDateTime,
  noticeCategoryMeta,
  noticeDetailErrorMessage,
  type NoticeDetailData,
} from '../notices.contract'

interface NoticeDetailDrawerProps {
  open: boolean
  /** 상세 경로가 돌려준 전문. 목록 행에는 앞 100자뿐이라 이 값으로만 본문을 그린다. */
  notice: NoticeDetailData | null
  isLoading: boolean
  isError: boolean
  error: unknown
  onClose: () => void
}

/**
 * 공지 전문 Drawer.
 *
 * 목록 응답에 `content`가 없어 열 때마다 상세를 따로 부른다 — 로딩·실패를 삼키면 빈 Drawer가
 * "내용 없는 공지"처럼 보인다. 404(150000)는 초안·내린 공지·다른 대상 공지를 한 코드로 끊으므로
 * 문구도 사유를 단정하지 않는다.
 */
export function NoticeDetailDrawer({
  open,
  notice,
  isLoading,
  isError,
  error,
  onClose,
}: NoticeDetailDrawerProps) {
  const meta = notice ? noticeCategoryMeta(notice.category) : null

  return (
    <Drawer open={open} onClose={onClose} title="공지 상세" width="lg">
      <div className="flex flex-col gap-4">
        {isLoading && <p className="text-body-sm text-text-tertiary">공지 내용을 불러오고 있어요.</p>}

        {isError && (
          <Alert variant="error" title="공지를 불러오지 못했어요">
            <p>{noticeDetailErrorMessage(error)}</p>
          </Alert>
        )}

        {notice != null && meta != null && (
          <>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill variant={meta.variant}>{meta.label}</StatusPill>
                {notice.pinned && <StatusPill variant="warning">고정</StatusPill>}
              </div>
              <p className="mt-2 text-subheading font-semibold text-text-primary">{notice.title}</p>
              <p className="mt-1 text-caption text-text-tertiary">
                {formatNoticeDateTime(notice.publishedAt)} 게시
              </p>
            </div>

            <p className="whitespace-pre-wrap text-body-sm leading-relaxed text-text-primary">
              {notice.content}
            </p>
          </>
        )}

        <div className="flex justify-end">
          <Button variant="ghost" size="md" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </Drawer>
  )
}
