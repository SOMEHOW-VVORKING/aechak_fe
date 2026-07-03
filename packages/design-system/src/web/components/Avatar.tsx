type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

export interface AvatarProps {
  src?: string
  name?: string
  size?: AvatarSize
  className?: string
}

const sizeClass: Record<AvatarSize, string> = {
  sm: 'size-6 text-badge',
  md: 'size-8 text-caption',
  lg: 'size-10 text-body-sm',
  xl: 'size-14 text-body',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function Avatar({ src, name, size = 'md', className = '' }: AvatarProps) {
  return (
    <span
      className={[
        'inline-flex flex-none items-center justify-center rounded-full bg-surface-sunken overflow-hidden',
        'font-semibold text-text-tertiary select-none',
        sizeClass[size],
        className,
      ].filter(Boolean).join(' ')}
      aria-label={name}
    >
      {src ? (
        <img src={src} alt={name ?? ''} className="size-full object-cover" />
      ) : name ? (
        getInitials(name)
      ) : null}
    </span>
  )
}
