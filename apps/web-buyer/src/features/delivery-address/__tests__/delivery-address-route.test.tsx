import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { DaumPostcodeData } from '../daum-postcode'
import { seedDeliveryAddresses, type DeliveryAddressRow } from '../../../testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 배송지는 @aechak/api fetcher로 서버에서 온다(훅 아님 — AGENTS.md breeds 절 컨벤션).
// 모듈 모킹 대신 MSW로 네트워크에서 가로챈다 — URL·메서드·envelope 해석까지 실제 경로가 돌아야
// 계약이 바뀌었을 때 여기서 잡힌다. 상태·응답 계약은 testing/msw/server.ts가 소유한다.
const SEED: DeliveryAddressRow[] = [
  {
    addressId: 1,
    label: '코코집사',
    receiverName: '코코집사',
    contactNumber: '01012345678', // 서버 저장 형식(숫자만)
    zipCode: '04030',
    baseAddress: '서울 마포구 양화로 00',
    detailAddress: '101동 1004호',
    deliveryMemo: '공동현관 비밀번호 #1004',
    isDefault: true,
  },
  {
    addressId: 2,
    label: '회사',
    receiverName: '코코집사',
    contactNumber: '01012345678',
    zipCode: '06200',
    baseAddress: '서울 강남구 테헤란로 000',
    detailAddress: '20층',
    isDefault: false,
  },
]

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

/** 라벨 텍스트가 든 카드 엘리먼트 — 배지가 어느 카드에 붙었는지 보려면 카드 단위로 좁혀야 한다. */
function card(label: string): HTMLElement {
  const el = screen.getByText(label).closest('div.rounded-card')
  if (!el) throw new Error(`카드를 찾지 못함: ${label}`)
  return el as HTMLElement
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
    seedDeliveryAddresses(SEED)
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
    // 서버는 숫자만 주고 화면이 하이픈을 조립한다
    expect(screen.getAllByText(/코코집사 \/ 010-1234-5678/)).not.toHaveLength(0)
  })

  it('[AC-ADDR-ROUTE-002] 우편번호 검색(Daum) → 주소 선택 시 우편번호/기본 주소가 채워지고 새 배송지가 목록에 나타난다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses')
    await screen.findByText('코코집사')

    await user.click(screen.getByRole('button', { name: '배송지 추가' }))
    await user.type(screen.getByLabelText(/배송지 이름/), '학교') // 이름은 선택 필드
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

    // 상세주소는 필수 → 입력해야 저장이 활성화된다
    await user.type(screen.getByPlaceholderText('상세 주소를 입력해주세요'), '4층 401호')

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

  it('[AC-ADDR-ROUTE-006] 기본 배송지를 삭제하면 승격된 배송지를 토스트로 알린다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses')
    await screen.findByText('코코집사')

    // 첫 카드(코코집사)가 기본 — 지우면 서버가 회사를 승격하고 그 id를 응답으로 준다
    await user.click(screen.getAllByRole('button', { name: '삭제' })[0]!)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '삭제' }))

    expect(await screen.findByText(/'회사' 배송지가 기본으로 설정됐어요/)).toBeInTheDocument()
  })

  it('[AC-ADDR-ROUTE-007] 일반 배송지 삭제는 승격 토스트를 띄우지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses')
    await screen.findByText('회사')

    // 마지막 카드(회사)는 기본이 아니라 승격이 일어나지 않는다 — 오안내 방지
    const deletes = screen.getAllByRole('button', { name: '삭제' })
    await user.click(deletes[deletes.length - 1]!)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(screen.queryByText('회사')).not.toBeInTheDocument())
    expect(screen.queryByText(/기본으로 설정됐어요/)).toBeNull()
  })

  it('[AC-ADDR-ROUTE-008] 수정하면 변경된 값이 목록에 반영된다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses')
    await screen.findByText('코코집사')

    await user.click(screen.getAllByRole('button', { name: '수정' })[0]!)
    const recipient = await screen.findByLabelText('받는 사람')
    await user.clear(recipient)
    await user.type(recipient, '김엄마')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText(/김엄마/)).toBeInTheDocument()
  })

  it('[AC-ADDR-ROUTE-009] 기본 배송지로 설정하면 배지가 그 카드로 옮겨간다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses')
    await screen.findByText('회사')

    // 기본이 아닌 카드에만 이 버튼이 뜬다 — 누르면 서버가 유일성을 정리하고 목록이 다시 읽힌다.
    await user.click(screen.getByRole('button', { name: '기본 배송지로 설정' }))

    // 배지가 회사 카드로 옮겨가고, 원래 기본이던 코코집사 카드에 설정 버튼이 생긴다
    await waitFor(() => expect(within(card('회사')).getByText('기본')).toBeInTheDocument())
    expect(within(card('코코집사')).getByRole('button', { name: '기본 배송지로 설정' })).toBeInTheDocument()
  })

  it('[AC-ADDR-ROUTE-010] 첫 배송지 등록 폼은 기본 배송지 체크가 켜진 채 잠겨 있다', async () => {
    // 서버가 첫 건을 무조건 기본으로 만든다 — 끌 수 있는 것처럼 보이면 UI가 거짓말을 한다.
    const user = userEvent.setup()
    seedDeliveryAddresses([])
    renderAt('/addresses')

    await user.click(await screen.findByRole('button', { name: '배송지 추가' }))

    const checkbox = screen.getByRole('checkbox', { name: /기본 배송지로 설정/ })
    expect(checkbox).toBeChecked()
    expect(checkbox).toBeDisabled()
    expect(screen.getByText('첫 배송지는 기본 배송지로 지정돼요')).toBeInTheDocument()
  })

  it('[AC-ADDR-ROUTE-011] 두 번째부터는 기본 배송지 체크를 사용자가 고른다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses')
    await screen.findByText('코코집사')

    await user.click(screen.getByRole('button', { name: '배송지 추가' }))

    const checkbox = screen.getByRole('checkbox', { name: /기본 배송지로 설정/ })
    expect(checkbox).not.toBeChecked()
    expect(checkbox).toBeEnabled()
    expect(screen.queryByText('첫 배송지는 기본 배송지로 지정돼요')).toBeNull()
  })

  it('[AC-ADDR-ROUTE-005] 배송지가 최대치(10개)면 "배송지 추가" 버튼이 비활성화된다', async () => {
    // 시드 2건 + 8건 = 10건(MAX_DELIVERY_ADDRESSES). 서버도 초과를 422/30120으로 막지만
    // 여기서 보는 건 도달 시 UI가 진입 자체를 막는 클라이언트 게이트다.
    seedDeliveryAddresses([
      ...SEED,
      ...Array.from({ length: 8 }, (_, i) => ({
        addressId: 10 + i,
        label: `추가-${i}`,
        receiverName: '테스터',
        contactNumber: '01000000000',
        zipCode: '00000',
        baseAddress: '서울 어딘가',
        isDefault: false,
      })),
    ])
    renderAt('/addresses')

    const addButton = await screen.findByRole('button', { name: '배송지 추가' })
    expect(addButton).toBeDisabled()
    expect(screen.getByText('10/10')).toBeInTheDocument()
  })
})
