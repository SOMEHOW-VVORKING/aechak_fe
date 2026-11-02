// 문의 목록(상품 상세·내 문의)의 더보기 버튼. 리뷰 목록의 같은 버튼과 모양을 맞췄지만 feature 간
// import가 금지라 여기 한 번 더 둔다.
export function LoadMoreInquiries({
  onClick,
  loading,
}: {
  onClick: () => void
  loading: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="h-11 w-full rounded-button border border-border bg-surface-base text-body-sm font-medium text-text-secondary transition-colors disabled:opacity-60"
    >
      {loading ? '불러오는 중…' : '더보기'}
    </button>
  )
}
