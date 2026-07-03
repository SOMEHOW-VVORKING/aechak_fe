import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

const variantClass: Record<ButtonVariant, string> = {
  primary: [
    'bg-brand text-brand-on',
    'hover:bg-brand-hover',
    'active:bg-brand-pressed',
    'disabled:bg-surface-disabled disabled:text-text-disabled',
  ].join(' '),
  secondary: [
    'bg-surface-raised text-text-primary border border-border',
    'hover:bg-surface-hover',
    'active:bg-surface-pressed',
    'disabled:bg-surface-disabled disabled:text-text-disabled disabled:border-border-subtle',
  ].join(' '),
  ghost: [
    'bg-transparent text-text-primary',
    'hover:bg-surface-hover',
    'active:bg-surface-pressed',
    'disabled:text-text-disabled',
  ].join(' '),
  // danger.solid / danger.strong / danger.fg 는 색조 토큰 —
  // hover=strong(더 진한 빨강), active=brightness로 추가 억제
  danger: [
    'bg-danger text-danger-on',
    'hover:bg-danger-strong',
    'active:bg-danger-strong active:brightness-90',
    'disabled:bg-surface-disabled disabled:text-text-disabled',
  ].join(' '),
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-label gap-1.5 rounded-button',
  md: 'h-10 px-4 text-button gap-2 rounded-button',
  lg: 'h-12 px-6 text-button-lg gap-2.5 rounded-button',
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center font-semibold select-none disabled:cursor-not-allowed',
        'transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:shadow-focus-ring',
        variantClass[variant],
        sizeClass[size],
        fullWidth && 'w-full',
        loading && 'cursor-wait',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && (
        <span
          className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true"
        />
      )}
      {!loading && leftIcon}
      {children}
      {rightIcon}
    </button>
  )
}
