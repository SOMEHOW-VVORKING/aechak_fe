import { Button, Drawer, StatusPill } from '@aechak/design-system/web'
import { SampleDataNotice } from '@/shared/components/SampleDataNotice'
import { NOTICE_CATEGORY_LABEL, NOTICE_CATEGORY_VARIANT, type SampleNotice } from '../notices.mock'

interface NoticeDetailDrawerProps {
  notice: SampleNotice | null
  onClose: () => void
}

/**
 * **띠를 Drawer 안에도 둔다**: DS Drawer는 `fixed inset-0` + `aria-modal` + 바디 스크롤 잠금이라
 * 열려 있는 동안 화면 맨 위의 띠가 보이지 않는다. 이 공지 본문은 정책 변경일·점검 시각처럼 읽히는
 * 글이고 닫기 외에 누를 것이 없어 토스트조차 안 뜬다 — 지어낸 날짜를 운영자가 사실로 믿을 자리라
 * 띠가 가장 필요한 화면이다(교차검토 지적).
 */
export function NoticeDetailDrawer({ notice, onClose }: NoticeDetailDrawerProps) {
  if (notice == null) return null

  return (
    <Drawer open onClose={onClose} title="공지 상세" width="lg">
      <div className="flex flex-col gap-4">
        <SampleDataNotice
          className="mb-0"
          replaceWhen={
            <>
              아래 날짜와 내용은 지어낸 예시예요. 운영자가 실제로 보낸 공지는 seller 호스트에 공지
              경로가 생기면 보여요.
            </>
          }
        />

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill variant={NOTICE_CATEGORY_VARIANT[notice.category]}>
              {NOTICE_CATEGORY_LABEL[notice.category]}
            </StatusPill>
            {notice.importance === 'IMPORTANT' && <StatusPill variant="warning">중요</StatusPill>}
          </div>
          <p className="mt-2 text-subheading font-semibold text-text-primary">{notice.title}</p>
          <p className="mt-1 text-caption text-text-tertiary">
            {notice.sender} / {notice.sentAt}
          </p>
        </div>

        <p className="whitespace-pre-wrap text-body-sm leading-relaxed text-text-primary">
          {notice.body}
        </p>

        <div className="flex justify-end">
          <Button variant="ghost" size="md" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </Drawer>
  )
}
