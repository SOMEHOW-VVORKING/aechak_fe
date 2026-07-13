import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReviewCard } from '@aechak/design-system/web'

describe('ReviewCard', () => {
  it('[AC-DS-REVIEW-001] 작성자/날짜/내용을 렌더링한다', () => {
    render(<ReviewCard author="집사**" rating={5} date="06.11" content="아주 만족해요." />)
    expect(screen.getByText('집사**')).toBeInTheDocument()
    expect(screen.getByText('06.11')).toBeInTheDocument()
    expect(screen.getByText('아주 만족해요.')).toBeInTheDocument()
  })

  it('[AC-DS-REVIEW-002] verifiedPurchase면 구매 인증 pill이 보인다', () => {
    render(
      <ReviewCard author="냥집사" rating={4} date="06.10" content="좋아요." verifiedPurchase />,
    )
    expect(screen.getByText('구매')).toBeInTheDocument()
  })

  it('[AC-DS-REVIEW-003] verifiedPurchase가 없으면 인증 pill이 없다', () => {
    render(<ReviewCard author="냥집사" rating={4} date="06.10" content="좋아요." />)
    expect(screen.queryByText('구매')).not.toBeInTheDocument()
  })

  it('[AC-DS-REVIEW-004] images를 주면 이미지 개수만큼 접근성 이름을 가진 사진을 렌더링한다', () => {
    const imgs = ['data:image/svg+xml;utf8,<svg/>', 'data:image/svg+xml;utf8,<svg/>']
    render(
      <ReviewCard author="집사" rating={5} date="06.11" content="사진 리뷰" images={imgs} />,
    )
    expect(screen.getAllByRole('img', { name: /리뷰 사진/ })).toHaveLength(2)
    expect(screen.getByRole('img', { name: '리뷰 사진 1' })).toBeInTheDocument()
  })

  it('[AC-DS-REVIEW-005] onImageClick을 주면 썸네일이 버튼이 되고 클릭 시 해당 index를 통지한다', async () => {
    const user = userEvent.setup()
    const onImageClick = vi.fn()
    const imgs = ['data:image/svg+xml;utf8,<svg/>', 'data:image/svg+xml;utf8,<svg/>']
    render(
      <ReviewCard
        author="집사"
        rating={5}
        date="06.11"
        content="사진 리뷰"
        images={imgs}
        onImageClick={onImageClick}
      />,
    )
    await user.click(screen.getByRole('button', { name: '리뷰 사진 2 확대 보기' }))
    expect(onImageClick).toHaveBeenCalledWith(1)
  })

  it('[AC-DS-REVIEW-006] onImageClick이 없으면 썸네일은 버튼이 아니다(정적 이미지)', () => {
    const imgs = ['data:image/svg+xml;utf8,<svg/>']
    render(
      <ReviewCard author="집사" rating={5} date="06.11" content="사진 리뷰" images={imgs} />,
    )
    expect(screen.queryByRole('button', { name: /리뷰 사진/ })).not.toBeInTheDocument()
  })
})
