import { render, screen, within } from '@testing-library/react'
import { SideNav, type NavGroup } from '@aechak/design-system/web'
import { describe, expect, it, vi } from 'vitest'

/**
 * `NavItem`의 숫자 배지(`badge`)와 글자 꼬리표(`tag`)가 **한 항목에서 함께** 그려지는지 고정한다.
 *
 * 왜 이 테스트가 따로 필요한가: SCRUM-304 통합에서 SCRUM-301(`badge`를 `number | string`으로
 * 넓힘)과 SCRUM-302(별도 `tag` 필드)가 같은 파일에서 충돌했고, **한 항목이 둘을 겸해야 한다**는
 * 근거로 필드를 나눈 302 설계를 택했다. 그런데 nav 테스트들은 배지가 붙은 항목(셀러 입점 심사)과
 * 꼬리표가 붙은 항목(상품 검수 관리)을 **서로 다른 항목에서** 확인하므로, 둘 중 하나만 렌더하도록
 * 바뀌어도 전부 통과한다 — 이 결정의 근거 자체는 아무 테스트도 지키지 않는 상태였다.
 *
 * 지금 어드민 nav에는 둘을 겸하는 항목이 없다(겸해야 할 때가 오면 그때 생긴다). 그래서 production
 * nav가 아니라 DS 컴포넌트에 직접 그 조합을 넘겨 계약을 확인한다. DS 패키지에는 테스트 러너가
 * 없고 AGENTS.md 4절이 "새 DS 웹 컴포넌트의 AC 테스트는 DS가 아니라 소비앱에 두고 import"로
 * 못박았으므로, 이 조합에 기대고 있는 소비앱(web-admin)에 둔다.
 */
const groups: NavGroup[] = [
  {
    key: 'ops',
    label: '운영',
    items: [
      // 겸하는 항목 — 서버가 "대기 3건"을 주는 동시에 목적지는 아직 열리지 않은 상태.
      { key: '/both', label: '둘 다', icon: <span />, badge: 3, tag: '준비 중' },
      { key: '/badge-only', label: '배지만', icon: <span />, badge: 7 },
      { key: '/tag-only', label: '꼬리표만', icon: <span />, tag: '준비 중' },
      { key: '/plain', label: '둘 다 없음', icon: <span /> },
    ],
  },
]

function renderNav() {
  render(<SideNav groups={groups} activeKey="/plain" onSelect={vi.fn()} />)
}

describe('SideNav 숫자 배지와 글자 꼬리표', () => {
  it('[AC-DS-SIDENAV-001] 한 항목에 배지와 꼬리표를 함께 주면 둘 다 그려진다', () => {
    renderNav()

    // 접근명에 양쪽이 모두 들어간다 — 한쪽만 렌더하면 이름이 달라져 여기서 깨진다.
    const item = screen.getByRole('button', { name: '둘 다 준비 중 3' })
    expect(within(item).getByText('준비 중')).toBeInTheDocument()
    expect(within(item).getByText('3')).toBeInTheDocument()
  })

  it('[AC-DS-SIDENAV-002] 꼬리표가 배지보다 앞에 온다(준비 중이 처리 건수처럼 읽히지 않게)', () => {
    renderNav()

    const item = screen.getByRole('button', { name: '둘 다 준비 중 3' })
    const texts = Array.from(item.querySelectorAll('span'))
      .map(node => node.textContent)
      .filter(text => text === '준비 중' || text === '3')

    expect(texts).toEqual(['준비 중', '3'])
  })

  it('[AC-DS-SIDENAV-003] 한쪽만 준 항목은 그 한쪽만 그린다', () => {
    renderNav()

    const badgeOnly = screen.getByRole('button', { name: '배지만 7' })
    expect(within(badgeOnly).queryByText('준비 중')).not.toBeInTheDocument()

    const tagOnly = screen.getByRole('button', { name: '꼬리표만 준비 중' })
    expect(within(tagOnly).getByText('준비 중')).toBeInTheDocument()

    // 아무것도 안 준 항목의 접근명은 라벨 그대로다(빈 배지 자리를 그리지 않는다).
    expect(screen.getByRole('button', { name: '둘 다 없음' })).toBeInTheDocument()
  })

  it.each([
    [0, '0건은 배지를 그리지 않는다'],
    [100, '99+로 상한을 둔다'],
  ])('[AC-DS-SIDENAV-004] 배지 숫자 %i — %s', (badge) => {
    render(
      <SideNav
        groups={[
          {
            key: 'ops',
            label: '운영',
            items: [{ key: '/x', label: '항목', icon: <span />, badge, tag: '준비 중' }],
          },
        ]}
        activeKey="/none"
        onSelect={vi.fn()}
      />,
    )

    // 겸하는 항목에서도 배지의 0 숨김·99+ 상한이 유지되어야 한다(꼬리표는 그대로 남는다).
    const expected = badge === 0 ? '항목 준비 중' : '항목 준비 중 99+'
    expect(screen.getByRole('button', { name: expected })).toBeInTheDocument()
  })
})
