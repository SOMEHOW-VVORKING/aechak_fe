// 1px 가로 구분선. 여백은 호출부가 className(my-0.5 등)으로 준다.
export function Divider({ className = '' }: { className?: string }) {
  return <div className={`h-px bg-border-subtle ${className}`} />
}
