import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppToast } from '../AppToast'

describe('AppToast', () => {
  it('[AC-WB-TOAST-001] 긴 한글 메시지를 whitespace-nowrap span으로 감싸 한 줄로 렌더한다', () => {
    render(<AppToast open onClose={() => {}} message="상품 링크를 복사했어요." />)
    // 하단 중앙 고정 DS Toast는 폭 미명시라 한글이 어디서나 줄바꿈돼 2줄로 깨진다.
    // 공통 래퍼가 메시지를 nowrap span으로 감싸 한 줄을 보장하는지 검증.
    const message = screen.getByText('상품 링크를 복사했어요.')
    expect(message.tagName).toBe('SPAN')
    expect(message).toHaveClass('whitespace-nowrap')
  })

  it('[AC-WB-TOAST-002] open=false면 아무것도 렌더하지 않는다', () => {
    render(<AppToast open={false} onClose={() => {}} message="숨김 메시지" />)
    expect(screen.queryByText('숨김 메시지')).not.toBeInTheDocument()
  })

  it('[AC-WB-TOAST-003] aboveActionBar 미지정이면 오프셋 컨테이너 없이 토스트만 렌더한다', () => {
    const { container } = render(<AppToast open onClose={() => {}} message="기본 토스트" />)
    // 감싸는 absolute 오프셋 div가 없어야 한다(기존 하단 중앙 고정 동작 유지).
    expect(container.querySelector('div.absolute')).toBeNull()
    expect(screen.getByText('기본 토스트')).toBeInTheDocument()
  })

  it('[AC-WB-TOAST-004] aboveActionBar면 토스트를 액션바 위로 올리는 오프셋 컨테이너로 감싼다', () => {
    const { container } = render(
      <AppToast open onClose={() => {}} message="액션바 위 토스트" aboveActionBar />,
    )
    // translateZ로 containing block을 만들고 bottom 오프셋을 준 전체폭 컨테이너가 있어야 한다.
    const wrapper = container.querySelector('div.absolute')
    expect(wrapper).not.toBeNull()
    expect(wrapper).toHaveClass('z-toast')
    expect((wrapper as HTMLElement).style.bottom).toContain('safe-area-inset-bottom')
    expect(screen.getByText('액션바 위 토스트')).toBeInTheDocument()
  })
})
