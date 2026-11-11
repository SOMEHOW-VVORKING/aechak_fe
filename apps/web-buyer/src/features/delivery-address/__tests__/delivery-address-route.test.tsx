import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { HttpResponse, http } from 'msw'
import { setAccessToken } from '@aechak/api'
import type { DaumPostcodeData } from '../daum-postcode'
import {
  DELIVERY_ADDRESSES_URL,
  seedDeliveryAddresses,
  server,
  type DeliveryAddressRow,
} from '../../../testing/msw/server'
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

type User = ReturnType<typeof userEvent.setup>

/** 우편번호 검색 시트(Daum 목)에서 후보 주소를 골라 우편번호/기본 주소를 채운다. */
async function searchAddress(user: User) {
  await user.click(screen.getByRole('button', { name: /우편번호 검색/ }))
  await user.click(await screen.findByRole('button', { name: /판교역로 235/ }))
}

/** 화면 검증을 모두 통과하는 새 배송지 입력. */
async function fillValidForm(user: User) {
  await user.type(screen.getByLabelText('받는 사람'), '홍길동')
  await user.type(screen.getByLabelText('휴대폰 번호'), '010-1111-2222')
  await searchAddress(user)
  await user.type(screen.getByPlaceholderText('상세 주소를 입력해주세요'), '4층')
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

  it('[AC-ADDR-ROUTE-015] 홈 버튼이 보이고 누르면 홈(\'/\')으로 간다', async () => {
    // 홈 가드는 access가 없으면 로그인으로 보낸다.
    setAccessToken('member-token')
    const user = userEvent.setup()
    renderAt('/addresses')

    await screen.findByText('회사')
    await user.click(screen.getByRole('button', { name: '홈으로 가기' }))
    expect(await screen.findByText('이런 상품은 어때요?')).toBeInTheDocument()
  })

  it('[AC-ADDR-ROUTE-017] 마이페이지에서 연 배송지 추가 폼에도 홈 버튼이 보인다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses')

    await screen.findByText('회사')
    await user.click(screen.getByRole('button', { name: /배송지 추가/ }))
    await screen.findByText('배송지 추가', { selector: 'span' })
    expect(screen.getByRole('button', { name: '홈으로 가기' })).toBeInTheDocument()
  })

  it('[AC-ADDR-ROUTE-016] 주문서에서 들어오면(from=checkout) 목록과 폼 모두 홈 버튼을 두지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses?from=checkout')

    await screen.findByText('회사')
    expect(screen.queryByRole('button', { name: '홈으로 가기' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /배송지 추가/ }))
    await screen.findByText('배송지 추가', { selector: 'span' })
    expect(screen.queryByRole('button', { name: '홈으로 가기' })).not.toBeInTheDocument()
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

  it('[AC-ADDR-ROUTE-004] 휴대폰 번호는 구분자를 걷어 숫자만 남기고, 형식이 틀리면 저장을 막고 벗어난 뒤 에러를 표시한다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses')
    await screen.findByText('코코집사')

    await user.click(screen.getByRole('button', { name: '배송지 추가' }))
    await user.type(screen.getByLabelText('받는 사람'), '홍길동')
    await searchAddress(user)
    await user.type(screen.getByPlaceholderText('상세 주소를 입력해주세요'), '4층')

    // 구분자(하이픈 등)는 서버 정규화(normalizeContactNumber)와 같은 규칙으로 걷힌다.
    const phone = screen.getByLabelText('휴대폰 번호')
    await user.type(phone, '010-99')
    expect(phone).toHaveValue('01099')
    // 자릿수가 모자라면 pattern 판정(BE DeliveryAddressPatterns)으로 저장을 바로 막는다.
    // 안내는 처음 입력하는 도중에는 띄우지 않고 칸을 벗어난 뒤에 띄운다.
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.queryByText('휴대폰 번호 형식을 확인해주세요. 예: 01012345678')).not.toBeInTheDocument()
    await user.tab()
    expect(screen.getByText('휴대폰 번호 형식을 확인해주세요. 예: 01012345678')).toBeInTheDocument()
    expect(phone).toHaveAccessibleDescription('휴대폰 번호 형식을 확인해주세요. 예: 01012345678')
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()

    // 휴대폰 접두가 아닌 번호(지역번호)도 형식 오류다.
    await user.clear(phone)
    await user.type(phone, '02-1234-5678')
    expect(screen.getByText('휴대폰 번호 형식을 확인해주세요. 예: 01012345678')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()

    await user.clear(phone)
    await user.type(phone, '010-9999-8888')
    expect(phone).toHaveValue('01099998888')
    expect(screen.queryByText('휴대폰 번호 형식을 확인해주세요. 예: 01012345678')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled()
  })

  it('[AC-ADDR-ROUTE-012] 필수 칸을 비운 채(공백만 포함) 벗어나면 필드 아래 안내가 뜨고 저장이 잠긴다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses')
    await screen.findByText('코코집사')

    await user.click(screen.getByRole('button', { name: '배송지 추가' }))
    // 손대지 않은 폼에는 오류가 없고 저장만 잠겨 있다.
    expect(screen.queryByText('받는 사람 이름을 입력해주세요')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()

    await user.type(screen.getByLabelText('받는 사람'), '   ')
    await user.tab() // 받는 사람 → 휴대폰 번호
    expect(await screen.findByText('받는 사람 이름을 입력해주세요')).toBeInTheDocument()
    // 안내는 보조기기에도 그 칸의 오류로 전달된다(aria-invalid + aria-describedby).
    expect(screen.getByLabelText('받는 사람')).toBeInvalid()
    expect(screen.getByLabelText('받는 사람')).toHaveAccessibleDescription('받는 사람 이름을 입력해주세요')
    await user.tab() // 휴대폰 번호를 비운 채 벗어남
    expect(await screen.findByText('휴대폰 번호를 입력해주세요')).toBeInTheDocument()
    expect(screen.getByLabelText('휴대폰 번호')).toHaveAccessibleDescription('휴대폰 번호를 입력해주세요')

    const detail = screen.getByPlaceholderText('상세 주소를 입력해주세요')
    await user.click(detail)
    await user.tab()
    expect(await screen.findByText('상세 주소를 입력해주세요')).toBeInTheDocument()
    expect(detail).toHaveAccessibleDescription('상세 주소를 입력해주세요')
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  it('[AC-ADDR-ROUTE-014] 입력 길이 상한은 BE 계약(AddDeliveryAddressRequest @Size)대로 maxlength 속성으로 걸린다', async () => {
    const user = userEvent.setup()
    renderAt('/addresses')
    await screen.findByText('코코집사')

    await user.click(screen.getByRole('button', { name: '배송지 추가' }))
    expect(screen.getByLabelText(/배송지 이름/)).toHaveAttribute('maxlength', '100')
    expect(screen.getByLabelText('받는 사람')).toHaveAttribute('maxlength', '50')
    expect(screen.getByPlaceholderText('상세 주소를 입력해주세요')).toHaveAttribute('maxlength', '512')
    expect(screen.getByLabelText('배송 요청사항')).toHaveAttribute('maxlength', '255')
  })

  it('[AC-ADDR-ROUTE-013] 화면 검증을 통과했는데 서버가 400/90001로 거절하면 한 문장 토스트를 띄우고 폼을 유지한다', async () => {
    server.use(
      http.post(DELIVERY_ADDRESSES_URL, () =>
        HttpResponse.json({ errorCode: 90001, message: '연락처 형식이 올바르지 않습니다.' }, { status: 400 }),
      ),
    )
    const user = userEvent.setup()
    renderAt('/addresses')
    await screen.findByText('코코집사')

    await user.click(screen.getByRole('button', { name: '배송지 추가' }))
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: '저장' }))

    // 서버 message 문구가 아니라 status/errorCode로 고른 문구다.
    expect(await screen.findByRole('alert')).toHaveTextContent('입력한 배송지 정보를 다시 확인해주세요')
    expect(screen.getByLabelText('받는 사람')).toHaveValue('홍길동')
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

  it('[AC-ADDR-ROUTE-005] 배송지가 최대치(10개)면 안내만 보여주고, 초과 등록은 서버 422/30500 문구로 알린다', async () => {
    // 시드 2건 + 8건 = 10건(MAX_DELIVERY_ADDRESSES). 한도는 서버가 판정한다(클라이언트 게이트 없음) —
    // 화면은 기획의 '최대 10개 안내'와 n/10 카운터만 두고, 서버 거절 문구를 토스트로 보여준다.
    const user = userEvent.setup()
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
    expect(addButton).toBeEnabled()
    expect(screen.getByText('10/10')).toBeInTheDocument()
    expect(screen.getByText('배송지는 최대 10개까지 등록할 수 있어요')).toBeInTheDocument()

    await user.click(addButton)
    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: '저장' }))

    // 서버(MSW가 재현한 한도)가 422/30500으로 거절하고 화면은 그 문구를 토스트로 띄운다.
    expect(await screen.findByRole('alert')).toHaveTextContent('배송지는 최대 10개까지 등록할 수 있어요')
  })
})
