/**
 * 리뷰 아래에 붙는 셀러 답글(SCRUM-315). 셀러만 보는 답글은 쓸모가 없어 구매자 목록에도 싣는다.
 *
 * DS ReviewCard와 MyReviewCard가 각자 카드 chrome을 그려 답글을 그 안에 밀어 넣을 수 없다 —
 * 두 카드 아래에 같은 모양으로 덧붙이는 조각으로 둔다(DS 미수정).
 */
export function SellerReplyNote({
  reply,
}: {
  reply: { content: string; repliedAt: string } | null
}) {
  if (reply == null) return null

  return (
    <div className="rounded-sm border-l-2 border-border-strong bg-surface-sunken px-3 py-2.5">
      <p className="text-caption text-text-tertiary">판매자 답글 · {reply.repliedAt.slice(5)}</p>
      <p className="mt-1 whitespace-pre-wrap text-body-sm leading-relaxed text-text-primary">
        {reply.content}
      </p>
    </div>
  )
}
