import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resetAddresses } from '@/shared/address'
import type { DaumPostcodeData } from '../daum-postcode'
import { routeTree } from '../../../routeTree.gen'

// jsdom에는 외부 스크립트/window.daum이 없으므로 Daum 우편번호 서비스를 목으로 주입한다.
// embed(container) 시 클릭 가능한 후보 버튼 하나를 그려, 누르면 oncomplete가 발화하도록 흉내낸다.
interface MockPostcodeOptions {
  oncomplete: (data: DaumPostcodeData) => void
  onclose?: (state: 'FORCE_CLOSE' | 'COMPLETE_CLOSE') => void
  width?: string | number
  height?: string | number
}

class MockPostcode {
  constructor(private options: MockPostcodeOptions) {}
  embed(container: HTMLElement) {
    const btn = container.ownerDocument.createElement('button')
    btn.type = 'button'
    btn.textContent = '경기 성남시 분당구 판교역로 235 (에이치스퀘어)'
    btn.addEventListener('click', () => {
      this.options.oncomplete({
        zonecode: '13529',
        roadAddress: '경기 성남시 분당구 판교역로 235',
        jibunAddress: '경기 성남시 분당구 삼평동 681',
        buildingName: '에이치스퀘어',
        apartment: 'N',
      })
    })
    container.appendChild(btn)
  }
}

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('/addresses', () => {
  beforeEach(() => {
    resetAddresses()
    window.daum = { Postcode: MockPostcode }
  })
  afterEach(() => {
    delete window.daum
  })

  it('[AC-ADDR-ROUTE-001] 배송지 목록과 기본 배지를 보여준다', async () => {
    renderAt('/addresses')
    expect(await screen.findByText('코코집사')).toBeInTheDocument()
    expect(screen.getByText('회사')).toBeInTheDocument()
    expect(screen.getByText('기본')).toBeInTheDocument()
  })

  it('[AC-ADDR-ROUTE-002] 우편번호 검색(Daum) → 주소 선택 시 우편번호/기본 주소가 채워지고 새 배송지가 목록에 나타난다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses')
    await screen.findByText('코코집사')

    await user.click(screen.getByRole('button', { name: '배송지 추가' }))
    await user.type(screen.getByLabelText('배송지 이름'), '학교')
    await user.type(screen.getByLabelText('받는 사람'), '홍길동')
    await user.type(screen.getByLabelText('휴대폰 번호'), '010-9999-8888')

    // 우편번호 검색 시트: Daum 임베드가 뜨고 후보 주소를 선택하면 폼이 채워진다
    await user.click(screen.getByRole('button', { name: /우편번호 검색/ }))
    await user.click(await screen.findByRole('button', { name: /판교역로 235/ }))

    // oncomplete가 우편번호(zonecode)·도로명 주소(+건물명)를 폼에 채운다
    expect(screen.getByDisplayValue('13529')).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('경기 성남시 분당구 판교역로 235 (에이치스퀘어)'),
    ).toBeInTheDocument()

    const save = screen.getByRole('button', { name: '저장' })
    expect(save).toBeEnabled()
    await user.click(save)

    expect(await screen.findByText('학교')).toBeInTheDocument()
  })

  it('[AC-ADDR-ROUTE-004] 휴대폰 번호는 숫자/하이픈만 허용하고 형식이 틀리면 에러를 표시한다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses')
    await screen.findByText('코코집사')

    await user.click(screen.getByRole('button', { name: '배송지 추가' }))
    const phone = screen.getByLabelText('휴대폰 번호')

    // 비숫자 입력(영문/한글/기호)은 걸러져 숫자·하이픈만 남는다
    await user.type(phone, '010-abc가나!!')
    expect(phone).toHaveValue('010-')

    // 자릿수가 모자란 잘못된 번호면 에러 안내가 뜬다
    await user.type(phone, '99')
    expect(screen.getByText('숫자로 된 휴대폰 번호를 입력해주세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  it('[AC-ADDR-ROUTE-003] 삭제는 확인 Modal을 거쳐 목록에서 제거한다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses')
    await screen.findByText('회사')

    const deletes = screen.getAllByRole('button', { name: '삭제' })
    await user.click(deletes[deletes.length - 1]!) // 마지막 카드(회사)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('이 배송지를 삭제할까요?')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(screen.queryByText('회사')).not.toBeInTheDocument())
  })
})
