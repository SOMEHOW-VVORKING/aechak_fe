import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageLightbox } from '../ImageLightbox'

describe('ImageLightbox', () => {
  it('[AC-WB-LIGHTBOX-001] src가 null이면 아무것도 렌더하지 않는다', () => {
    render(<ImageLightbox src={null} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('[AC-WB-LIGHTBOX-002] src가 있으면 확대 이미지를 dialog로 렌더한다', () => {
    render(<ImageLightbox src="data:image/svg+xml;utf8,<svg/>" onClose={() => {}} alt="리뷰 사진" />)
    expect(screen.getByRole('dialog', { name: '리뷰 사진 확대 보기' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '리뷰 사진' })).toBeInTheDocument()
  })

  it('[AC-WB-LIGHTBOX-003] 닫기 버튼을 누르면 onClose가 호출된다', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ImageLightbox src="data:image/svg+xml;utf8,<svg/>" onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('[AC-WB-LIGHTBOX-004] Escape 키를 누르면 onClose가 호출된다', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ImageLightbox src="data:image/svg+xml;utf8,<svg/>" onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
