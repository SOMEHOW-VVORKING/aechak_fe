import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  /** 자식 입력의 id. 주면 라벨을 `<label for>`로 그려 입력에 접근 가능한 이름을 붙인다. */
  htmlFor?: string
  required?: boolean
  /** 라벨 오른쪽 끝에 두는 보조 컨트롤(예: 출고지와 동일 체크박스). */
  trailing?: ReactNode
  children: ReactNode
}

// DS Input의 label 슬롯과 같은 모양(gap-1.5, text-label)인데 필수 별표나 라벨 옆 컨트롤 때문에
// label prop을 못 쓰는 자리(SegmentedControl/NumberInput/칩 입력 등)에 쓴다.
export function Field({ label, htmlFor, required = false, trailing, children }: FieldProps) {
  const Tag = htmlFor ? 'label' : 'span'
  const text = (
    <Tag htmlFor={htmlFor} className="text-label font-medium text-text-primary">
      {required ? (
        <>
          {label} <span className="text-error-fg">*</span>
        </>
      ) : (
        label
      )}
    </Tag>
  )
  return (
    <div className="flex flex-col gap-1.5">
      {trailing ? (
        <div className="flex items-center justify-between">
          {text}
          {trailing}
        </div>
      ) : (
        text
      )}
      {children}
    </div>
  )
}

/** helperText를 못 받는 자리(이미지, 옵션값, DatePicker, 서류 등)의 오류 문구. 나타날 때 바로 읽히도록 alert. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="text-caption text-error-fg">
      {children}
    </p>
  )
}
