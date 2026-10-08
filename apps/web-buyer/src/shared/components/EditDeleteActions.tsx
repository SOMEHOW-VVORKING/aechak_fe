// 카드 우측 상단의 수정/삭제 텍스트 버튼 쌍(펫 프로필 카드, 배송지 카드 공용).
export function EditDeleteActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <span className="flex flex-none items-center gap-3 text-caption">
      <button type="button" onClick={onEdit} className="text-text-tertiary">
        수정
      </button>
      <button type="button" onClick={onDelete} className="text-error-fg">
        삭제
      </button>
    </span>
  )
}
