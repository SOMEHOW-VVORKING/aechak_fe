// 리뷰 목록(내 리뷰/상품 리뷰)의 더보기 버튼. DS Button secondary와 모양이 달라(h-11, 중립 테두리) feature 로컬로 둔다.
export function LoadMoreButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
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
