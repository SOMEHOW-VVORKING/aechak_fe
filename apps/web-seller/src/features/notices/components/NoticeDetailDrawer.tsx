import { Button, Drawer, StatusPill } from '@aechak/design-system/web'
import { NOTICE_CATEGORY_LABEL, NOTICE_CATEGORY_VARIANT, type SampleNotice } from '../notices.mock'

interface NoticeDetailDrawerProps {
  notice: SampleNotice | null
  onClose: () => void
}

export function NoticeDetailDrawer({ notice, onClose }: NoticeDetailDrawerProps) {
  if (notice == null) return null

  return (
    <Drawer open onClose={onClose} title="공지 상세" width="lg">
      <div className="flex flex-col gap-4">
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
