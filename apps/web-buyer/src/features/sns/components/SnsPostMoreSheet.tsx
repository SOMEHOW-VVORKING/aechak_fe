import { Ban, EyeOff, Link2, Pencil, Trash2 } from 'lucide-react'
import { BottomSheet, ListItem } from '@aechak/design-system/web'
import type { SnsPost } from '../sns.queries'

interface SnsPostMoreSheetProps {
  post: SnsPost
  open: boolean
  onClose: () => void
  /** 다시 조회가 실패해 마지막 내용만 남은 상세는 링크 복사만 둔다(AGENTS.md 6절 7) */
  locked?: boolean
  onCopyLink: () => void
  onEdit: () => void
  onDelete: () => void
  /** 뮤트한 작성자면 뮤트 해제, 아니면 뮤트다. 무엇을 할지는 부르는 화면이 정한다 */
  onMute: () => void
  onBlock: () => void
}

// 게시물 더보기 시트(b7-st-2 2-B). 상세와 피드 카드가 같은 항목을 연다(design 6절 4번). 수정과 삭제는 본인 게시물에만
// 있고 신고는 SNS-07 전까지 숨긴다(P12). 항목을 누르면 시트를 먼저 닫고 동작을 부른다.
export function SnsPostMoreSheet({
  post,
  open,
  onClose,
  locked = false,
  onCopyLink,
  onEdit,
  onDelete,
  onMute,
  onBlock,
}: SnsPostMoreSheetProps) {
  const item = (action: () => void) => () => {
    onClose()
    action()
  }
  return (
    <BottomSheet open={open} onClose={onClose}>
      <ListItem leading={<Link2 className="size-5" />} title="링크 복사" onClick={item(onCopyLink)} />
      {post.isMine && !locked && (
        <>
          <ListItem leading={<Pencil className="size-5" />} title="수정" onClick={item(onEdit)} />
          <ListItem leading={<Trash2 className="size-5" />} title="삭제" onClick={item(onDelete)} />
        </>
      )}
      {!post.isMine && !locked && (
        <>
          <ListItem
            leading={<EyeOff className="size-5" />}
            title={post.mutedByMe ? '뮤트 해제' : '뮤트하기'}
            onClick={item(onMute)}
          />
          <ListItem leading={<Ban className="size-5" />} title="차단하기" onClick={item(onBlock)} />
        </>
      )}
    </BottomSheet>
  )
}
