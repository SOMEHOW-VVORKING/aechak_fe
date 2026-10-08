// 추천 검색어 칩(검색 랜딩, 검색 결과 무결과 안내 공용). 탭하면 그 키워드로 검색한다.
export function KeywordChip({ keyword, onClick }: { keyword: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center rounded-chip bg-surface-sunken px-3.5 text-body-sm text-text-secondary"
    >
      {keyword}
    </button>
  )
}
