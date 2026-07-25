import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { DaumPostcodeData } from '../daum-postcode'
import { routeTree } from '../../../routeTree.gen'

// 배송지는 @aechak/api fetcher로 서버에서 온다(훅 아님 — AGENTS.md breeds 절 컨벤션). jsdom엔
// 서버가 없으므로 fetcher들을 vi.mock으로 대체하되, 목록/추가/삭제/기본지정이 실제로 반영되는
// 상태 있는 인메모리 백엔드를 흉내 낸다. 목록 갱신은 어댑터(shared/delivery-address)의
// mutation onSuccess → invalidate → 실제 react-query refetch 경로로 이뤄진다.
type Row = {
  addressId: number
  receiverName?: string
  contactNumber?: string
  zipCode?: string
  baseAddress?: string
  detailAddress?: string | null
  deliveryMemo?: string | null
  label?: string | null
  isDefault?: boolean
}

// 이 인메모리 백엔드는 서버 불변식(기본 배송지 유일성 · 기본 삭제 시 자동 승격 · 최대 10개 제한)을
// 재현하지 않는다 — 서버가 소유하는 로직이라 클라이언트/테스트가 흉내 내면 안 된다. 순수 CRUD만 하고
// isDefault는 요청 값을 그대로 저장한다. 최대 개수 도달 시 UI 비활성 같은 "클라이언트" 게이트만 검증한다.
const api = vi.hoisted(() => {
  let rows: Row[] = []
  let seq = 0
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach(l => l())
  return {
    reset() {
      seq = 2
      rows = [
        {
          addressId: 1,
          label: '코코집사',
          receiverName: '코코집사',
          contactNumber: '01012345678', // 서버 저장 형식(숫자만)
          zipCode: '04030',
          baseAddress: '서울 마포구 양화로 00, 101동 1004호',
          detailAddress: '',
          deliveryMemo: '공동현관 비밀번호 #1004',
          isDefault: true,
        },
        {
          addressId: 2,
          label: '회사',
          receiverName: '코코집사',
          contactNumber: '01012345678', // 서버 저장 형식(숫자만)
          zipCode: '06200',
          baseAddress: '서울 강남구 테헤란로 000, 20층',
          detailAddress: '',
          isDefault: false,
        },
      ]
      emit()
    },
    getRows: () => rows,
    subscribe(cb: () => void) {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    add(data: Omit<Row, 'addressId'>) {
      seq += 1
      rows = rows.concat({ ...data, addressId: seq, isDefault: data.isDefault ?? false })
      emit()
    },
    update(id: number, data: Omit<Row, 'addressId'>) {
      rows = rows.map(r => (r.addressId === id ? { ...r, ...data, addressId: id } : r))
      emit()
    },
    remove(id: number) {
      rows = rows.filter(r => r.addressId !== id)
      emit()
    },
    setDefault(id: number) {
      rows = rows.map(r => (r.addressId === id ? { ...r, isDefault: true } : r))
      emit()
    },
  }
})

vi.mock('@aechak/api', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getDeliveryAddresses: () =>
      Promise.resolve({ data: { addresses: api.getRows(), totalCount: api.getRows().length } }),
    addDeliveryAddress: (data: Omit<Row, 'addressId'>) => {
      api.add(data)
      return Promise.resolve({
        data: { addressId: 0, isDefault: data.isDefault ?? false, totalCount: api.getRows().length },
      })
    },
    updateDeliveryAddress: (id: number, data: Omit<Row, 'addressId'>) => {
      api.update(id, data)
      return Promise.resolve({ data: { addressId: id, isDefault: data.isDefault ?? false } })
    },
    deleteDeliveryAddress: (id: number) => {
      api.remove(id)
      return Promise.resolve({ data: { promotedDefaultAddressId: null } })
    },
    setDefaultDeliveryAddress: (id: number) => {
      api.setDefault(id)
      return Promise.resolve({ data: { addressId: id, isDefault: true } })
    },
  }
})

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
    api.reset()
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

  it('[AC-ADDR-ROUTE-005] 배송지가 최대치(10개)면 "배송지 추가" 버튼이 비활성화된다', async () => {
    // 시드 2건 + 8건 = 10건(MAX_DELIVERY_ADDRESSES). 최대 개수 제한은 클라이언트 UI 게이트다(서버 아님).
    for (let i = 0; i < 8; i++) {
      api.add({
        label: `추가-${i}`,
        receiverName: '테스터',
        contactNumber: '010-0000-0000',
        zipCode: '00000',
        baseAddress: '서울 어딘가',
        isDefault: false,
      })
    }
    renderAt('/addresses')

    const addButton = await screen.findByRole('button', { name: '배송지 추가' })
    expect(addButton).toBeDisabled()
    expect(screen.getByText('10/10')).toBeInTheDocument()
  })
})
