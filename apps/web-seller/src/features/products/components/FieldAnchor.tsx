import type { ReactNode } from 'react'
import { fieldDomId, type ProductFormErrors } from '../products.contract'

// 필수값 누락 시 자동 스크롤/포커스의 기준점(CRQ-PRD-02). DatePicker/PhotoUpload/옵션 셀처럼
// id를 못 받는 필드도 있어 입력 자체가 아니라 감싼 div에 id를 둔다.
// DS에 Tooltip이 없어(4개 앱 공용이라 이 화면 하나로 추가하지 않음) 안내 말풍선은 feature에 둔다.

export const tooltipId = (key: string) => `${fieldDomId(key)}-tip`
export const fieldInputId = (key: string) => `${fieldDomId(key)}-input`
/** DS Input이 helperText에 붙이는 id(`${id}-helper`)와 같다. */
export const fieldHelperId = (key: string) => `${fieldInputId(key)}-helper`

/**
 * DS Input은 helperText를 입력과 잇지 않고 aria-invalid도 안 붙인다 — 호출부가 id와 함께 넘긴다.
 * 말풍선이 떠 있으면 말풍선(helper와 같은 문구)을, 아니면 helper를 설명으로 잇는다.
 */
export function fieldA11y(key: string, errors: ProductFormErrors, tooltipKey: string | null, hasHelper = true) {
  const error = errors[key]
  return {
    id: fieldInputId(key),
    'aria-invalid': error ? true : undefined,
    'aria-describedby': !error
      ? undefined
      : tooltipKey === key
        ? tooltipId(key)
        : hasHelper
          ? fieldHelperId(key)
          : undefined,
  }
}

export function FieldAnchor({ fieldKey, tip, children }: { fieldKey: string; tip?: string; children: ReactNode }) {
  return (
    <div id={fieldDomId(fieldKey)} className="relative">
      {tip && (
        <div
          role="tooltip"
          id={tooltipId(fieldKey)}
          className="absolute bottom-full left-0 z-10 mb-1.5 whitespace-nowrap rounded-md bg-surface-inverse px-2.5 py-1.5 text-caption text-text-inverse shadow-md"
        >
          {tip}
        </div>
      )}
      {children}
    </div>
  )
}
