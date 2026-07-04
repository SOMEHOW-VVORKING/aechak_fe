export interface DocumentHeaderProps {
  title: string
  revision?: string
  className?: string
}

export function DocumentHeader({ title, revision, className = '' }: DocumentHeaderProps) {
  return (
    <div className={['px-4 pt-[18px] pb-3.5 border-b border-border-subtle', className].filter(Boolean).join(' ')}>
      <p className="text-heading font-semibold text-text-primary tracking-tight">{title}</p>
      {revision && <p className="text-caption text-text-tertiary mt-1.5">{revision}</p>}
    </div>
  )
}
