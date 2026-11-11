import type { ButtonHTMLAttributes } from 'react'

export interface KakaoLoginButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  loading?: boolean
}

// 카카오 로그인 디자인 가이드: https://developers.kakao.com/docs/latest/ko/kakaologin/design-guide
// 심볼 path는 공식 리소스(Kakao Login.zip의 SVG/kakao_login_light.svg)에서 그대로 가져왔다.
export function KakaoLoginButton({
  loading = false,
  disabled,
  type = 'button',
  className = '',
  ...props
}: KakaoLoginButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-6 select-none',
        'bg-[#FEE500] text-button font-medium text-black/85',
        'focus-visible:outline-none focus-visible:shadow-focus-ring',
        'disabled:cursor-not-allowed',
        loading ? 'cursor-wait' : disabled && 'opacity-50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Segoe UI', Roboto, system-ui, sans-serif",
      }}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      <svg viewBox="13 14 22 21" className="h-[13px] w-auto flex-none" aria-hidden="true">
        <path
          d="M24.0014 14C17.9241 14 13 18.0219 13 22.9825C13 26.1711 15.0368 28.9728 18.1057 30.5656L17.0681 34.5677C17.0295 34.6871 17.0598 34.8151 17.1424 34.9033C17.2029 34.9659 17.2855 35 17.3653 35C17.4341 35 17.5029 34.9772 17.5607 34.9289L22.0196 31.8171C22.661 31.911 23.3215 31.9622 23.9986 31.9622C30.0732 31.9622 35 27.9403 35 22.9797C35 18.0191 30.0759 14 24.0014 14Z"
          fill="#000000"
        />
      </svg>
      카카오 로그인
      {loading && (
        <span
          className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin"
          aria-hidden="true"
        />
      )}
    </button>
  )
}
