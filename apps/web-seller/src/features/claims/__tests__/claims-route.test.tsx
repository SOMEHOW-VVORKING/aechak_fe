import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter, createMemoryHistory } from '@tanstack/react-router'
import { delay, http, HttpResponse } from 'msw'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SELLER_CLAIMS_URL,
  claimRequestCount,
  currentClaims,
  lastSellerClaimsQuery,
  seedClaims,
  seedCouriers,
  server,
  updateClaimRow,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

// 실 API 연동 — MSW가 seller 호스트(8081) /sellers/me/claims 8경로를 가로챈다. 모듈 모킹이 아니라
// 네트워크 레벨이라 URL·호스트·envelope·에러 계약까지 함께 검증되고, test-setup의
// onUnhandledRequest:'error'가 핸들러 없는 요청을 곧바로 실패로 만든다.
function renderClaims(entry = '/claims') {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [entry] }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const rowOf = async (text: string) => (await screen.findByText(text)).closest('tr') as HTMLElement
const claimById = (id: string) => currentClaims().find(row => row.claimPublicId === id)!

/**
 * 확인 Modal의 확정 버튼을 누른다. Drawer와 Modal이 같은 `role="dialog"`를 쓰고 확정 버튼 문구가
 * 목록 행 버튼과 같아서(예: 반품 승인) 제목으로 Modal을 좁힌 뒤 그 안에서 찾는다.
 */
async function clickConfirm(title: string, name: string) {
  const dialog = (await screen.findByRole('heading', { name: title })).closest(
    '[role="dialog"]',
  ) as HTMLElement
  await userEvent.click(within(dialog).getByRole('button', { name }))
}

beforeEach(() => {
  seedClaims()
  seedCouriers()
})

describe('셀러 클레임 목록', () => {
  it('[AC-SELLER-CLAIM-101] 서버 목록을 유형 배지·구매자 사유·반품비와 함께 보여준다', async () => {
    renderClaims()

    const row = await rowOf('자동 급식기 5L')
    // reasonLabel이 실린 행은 그 문구를, 없는 행은 코드를 그대로 보여준다.
    expect(within(row).getByText('상품이 파손되었거나 불량이에요')).toBeInTheDocument()
    expect(within(row).getByText('포장을 열자마자 급식기 뚜껑이 깨져 있었어요')).toBeInTheDocument()
    // 승인 전에는 부담 주체가 비어 있고 금액(정책 스냅샷)만 정해져 있다.
    expect(within(row).getByText('부담 주체 미정 / 3,000원')).toBeInTheDocument()
    expect(within(row).getByText('59,000원')).toBeInTheDocument()

    const cancelRow = await rowOf('동결건조 간식 100g')
    expect(within(cancelRow).getByText('CHANGE_OF_MIND')).toBeInTheDocument()
    expect(within(cancelRow).getByText('반품비 없음 (미발송)')).toBeInTheDocument()

    // 유형 탭 배지는 counts(유형 필터 무시)를 쓴다 — 취소 1 / 반품 2 / 교환 1.
    expect(screen.getByRole('tab', { name: '전체 4' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '반품 2' })).toBeInTheDocument()
  })

  // 대시보드 카드가 처리 단계와 유형을 주소로 실어 보낸다(SCRUM-292). 라우트가 그 값을 받지 않으면
  // 카드의 "그 단계의 목록이 열려요" 안내가 거짓이 된다 — 목록이 전체로 열린다.
  it('[AC-SELLER-CLAIM-102b] 주소로 받은 처리 단계·유형이 첫 조회에 그대로 실린다', async () => {
    renderClaims('/claims?pendingStage=DECISION_PENDING&claimType=RETURN')

    await waitFor(() => {
      expect(lastSellerClaimsQuery()).toBe('?claimType=RETURN&pendingStage=DECISION_PENDING&page=0')
    })
  })

  // 모르는 값은 버린다 — 서버가 400으로 거절하는 어휘를 주소에서 그대로 통과시키지 않는다.
  it('[AC-SELLER-CLAIM-102c] 주소의 모르는 단계·유형은 버리고 전체로 연다', async () => {
    renderClaims('/claims?pendingStage=NOPE&claimType=DISPUTE')

    await waitFor(() => expect(lastSellerClaimsQuery()).toBe('?page=0'))
  })

  it('[AC-SELLER-CLAIM-102] 빈 필터는 쿼리에서 빠지고 선택한 축만 반복 파라미터로 나간다', async () => {
    renderClaims()
    await rowOf('자동 급식기 5L')
    // '전체'가 기본값이라 보낸 파라미터는 page뿐이다(빈 값을 보내면 서버가 400/90001로 거절한다).
    expect(lastSellerClaimsQuery()).toBe('?page=0')

    await userEvent.selectOptions(screen.getByLabelText('처리 단계'), 'COLLECTION_COMPLETION_PENDING')

    await waitFor(() => {
      expect(lastSellerClaimsQuery()).toBe('?pendingStage=COLLECTION_COMPLETION_PENDING&page=0')
    })
    // 회수 완료 처리 대기 단계에는 회수 송장이 등록된 반품 1건만 남는다.
    expect(await screen.findByText('캣닢 장난감 세트')).toBeInTheDocument()
    expect(screen.queryByText('자동 급식기 5L')).not.toBeInTheDocument()
  })

  it('[AC-SELLER-CLAIM-103] 목록 조회 실패는 빈 상태가 아니라 사유와 재시도로 드러난다', async () => {
    server.use(
      http.get(SELLER_CLAIMS_URL, () =>
        HttpResponse.json({ errorCode: 50404, message: '클레임을 처리할 권한이 없습니다.' }, { status: 403 }),
      ),
    )
    renderClaims()

    expect(
      await screen.findByText('판매 활동이 가능한 계정만 클레임을 볼 수 있어요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(screen.queryByText('조건에 맞는 클레임이 없어요.')).not.toBeInTheDocument()
  })
})

describe('승인 — 반품비 부담 주체 지정', () => {
  it('[AC-SELLER-CLAIM-104] 반품 승인은 구매자 사유를 보여주고 부담 주체를 고를 때까지 막는다', async () => {
    renderClaims()
    const row = await rowOf('자동 급식기 5L')

    await userEvent.click(within(row).getByRole('button', { name: '반품 승인' }))

    // 서버가 사유로 유도하지 않으므로 구매자가 적은 사유가 Modal에 그대로 있어야 한다.
    const dialog = (await screen.findByRole('heading', { name: '반품 승인할까요?' })).closest(
      '[role="dialog"]',
    ) as HTMLElement
    expect(within(dialog).getByText('포장을 열자마자 급식기 뚜껑이 깨져 있었어요')).toBeInTheDocument()
    expect(within(dialog).getByText('상품이 파손되었거나 불량이에요')).toBeInTheDocument()

    await clickConfirm('반품 승인할까요?', '반품 승인')
    expect(await screen.findByText('반품비 부담 주체를 골라야 승인할 수 있어요.')).toBeInTheDocument()
    // 상태만 보면 "요청이 나가서 서버가 거절한" 경우와 구별되지 않는다 — 요청 수로 단언한다.
    expect(claimRequestCount('approve')).toBe(0)
    expect(claimById('claim-return-1').status).toBe('CLAIM_REQUESTED')

    await userEvent.click(screen.getByText('셀러 부담'))
    await clickConfirm('반품 승인할까요?', '반품 승인')

    await waitFor(() => {
      const claim = claimById('claim-return-1')
      expect(claim.status).toBe('COLLECTING')
      expect(claim.returnCostBearer).toBe('SELLER')
    })
    expect(await screen.findByText('승인했어요. 회수 송장을 등록해 주세요.')).toBeInTheDocument()
  })

  it('[AC-SELLER-CLAIM-105] 취소 승인은 부담 주체를 묻지 않고 바로 승인한다', async () => {
    renderClaims()
    const row = await rowOf('동결건조 간식 100g')

    await userEvent.click(within(row).getByRole('button', { name: '취소 승인' }))
    expect(await screen.findByText('취소 승인할까요?')).toBeInTheDocument()
    expect(screen.queryByText('반품비 부담 주체')).not.toBeInTheDocument()

    await clickConfirm('취소 승인할까요?', '취소 승인')

    await waitFor(() => {
      const claim = claimById('claim-cancel-1')
      expect(claim.status).toBe('APPROVED')
      // 취소에는 부담 주체를 저장하지 않는다.
      expect(claim.returnCostBearer).toBeNull()
    })
  })
})

describe('거부 — 사유 필수', () => {
  it('[AC-SELLER-CLAIM-106] 사유가 비면 보내지 않고, 적으면 그 사유가 서버로 간다', async () => {
    renderClaims()
    const row = await rowOf('자동 급식기 5L')

    await userEvent.click(within(row).getByRole('button', { name: '거부' }))
    await clickConfirm('반품 요청을 거부할까요?', '거부')

    expect(await screen.findByText('거부 사유를 입력해 주세요.')).toBeInTheDocument()
    // 빈 사유를 그대로 보내도 서버가 400/50405로 막아 상태는 그대로다 — 상태 단언만으로는 "보내지
    // 않았다"를 증명하지 못한다. 요청 수가 그 둘을 가른다.
    expect(claimRequestCount('reject')).toBe(0)
    expect(claimById('claim-return-1').status).toBe('CLAIM_REQUESTED')

    await userEvent.type(screen.getByLabelText('거부 사유'), '파손 흔적이 확인되지 않았어요')
    await clickConfirm('반품 요청을 거부할까요?', '거부')

    await waitFor(() => {
      const claim = claimById('claim-return-1')
      expect(claim.status).toBe('REJECTED')
      expect(claim.rejectionReason).toBe('파손 흔적이 확인되지 않았어요')
    })
    expect(claimRequestCount('reject')).toBe(1)
  })
})

describe('중복 전송 방지와 충돌 복구', () => {
  it('[AC-SELLER-CLAIM-112] 응답을 기다리는 동안 확정을 다시 눌러도 요청은 한 번만 나간다', async () => {
    // 느린 서버를 만든다 — 즉시 응답하면 두 번째 클릭이 들어갈 틈 자체가 없어 아무것도 검증하지 못한다.
    // 횟수는 이 핸들러가 직접 센다(기본 핸들러를 가로챘으므로 claimRequestCount는 늘지 않는다).
    let approveCalls = 0
    server.use(
      http.post(`${SELLER_CLAIMS_URL}/:claimPublicId/approve`, async () => {
        approveCalls += 1
        await delay(60)
        updateClaimRow('claim-cancel-1', { status: 'APPROVED', sellerApprovalStatus: 'APPROVED' })
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderClaims()
    const row = await rowOf('동결건조 간식 100g')

    await userEvent.click(within(row).getByRole('button', { name: '취소 승인' }))
    const dialog = (await screen.findByRole('heading', { name: '취소 승인할까요?' })).closest(
      '[role="dialog"]',
    ) as HTMLElement
    const confirm = within(dialog).getByRole('button', { name: '취소 승인' })

    await userEvent.dblClick(confirm)
    // 첫 클릭이 mutation을 띄우면 DS Modal이 confirm을 `disabled={loading}`로 잠근다.
    expect(confirm).toBeDisabled()

    await waitFor(() => expect(screen.queryByRole('heading', { name: '취소 승인할까요?' })).toBeNull())
    expect(approveCalls).toBe(1)
  })

  it('[AC-SELLER-CLAIM-113] 처리 실패도 목록을 다시 불러와 낡은 버튼을 남기지 않는다', async () => {
    // 다른 작업자가 먼저 승인한 상황 — 서버는 409/50408을 주고 그 뒤 조회는 바뀐 상태를 준다.
    server.use(
      http.post(`${SELLER_CLAIMS_URL}/:claimPublicId/approve`, () => {
        updateClaimRow('claim-return-1', { status: 'COLLECTING', sellerApprovalStatus: 'APPROVED' })
        return HttpResponse.json(
          { errorCode: 50408, message: '이미 처리된 클레임입니다.' },
          { status: 409 },
        )
      }),
    )
    renderClaims()
    const row = await rowOf('자동 급식기 5L')

    await userEvent.click(within(row).getByRole('button', { name: '반품 승인' }))
    await userEvent.click(screen.getByText('셀러 부담'))
    await clickConfirm('반품 승인할까요?', '반품 승인')

    expect(
      await screen.findByText('이미 처리된 클레임이에요. 목록을 새로고침해 주세요.'),
    ).toBeInTheDocument()
    // 실패 뒤 무효화가 없으면 같은 행에 승인 버튼이 남아 같은 실패를 되풀이한다.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '반품 승인' })).toBeNull()
    })
    expect(within(await rowOf('자동 급식기 5L')).getByRole('button', { name: '회수 처리' })).toBeInTheDocument()
  })
})

describe('상세 Drawer — 회수 단계와 메모', () => {
  it('[AC-SELLER-CLAIM-107] 회수 송장이 없는 건은 상세에서 송장 등록을 받는다', async () => {
    // 승인만 된(회수 미시작) 반품을 만든다.
    const collecting = currentClaims().map(row =>
      row.claimPublicId === 'claim-return-2'
        ? { ...row, collectionStartedAt: null }
        : row,
    )
    seedClaims(collecting)
    renderClaims()

    await userEvent.click(within(await rowOf('캣닢 장난감 세트')).getByRole('button', { name: '회수 처리' }))

    expect(await screen.findByRole('button', { name: '회수 송장 등록' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '회수 완료' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '회수 송장 등록' }))
    await userEvent.selectOptions(await screen.findByLabelText('택배사'), 'CJ')
    await userEvent.type(screen.getByLabelText('송장번호'), '123456789012')
    await clickConfirm('회수 송장을 등록할까요?', '회수 송장 등록')

    await waitFor(() => expect(claimById('claim-return-2').collectionStartedAt).not.toBeNull())
    expect(await screen.findByText('회수 송장을 등록했어요.')).toBeInTheDocument()
  })

  it('[AC-SELLER-CLAIM-108] 회수 송장이 등록된 건은 이력으로 가려 회수 완료를 받는다', async () => {
    renderClaims()

    await userEvent.click(within(await rowOf('캣닢 장난감 세트')).getByRole('button', { name: '회수 처리' }))

    // 상세 이력의 COLLECTION_STARTED가 단계를 가르는 근거다(목록 응답에는 그 필드가 없다).
    expect(await screen.findByText('회수 송장 등록')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '회수 완료' }))
    await clickConfirm('회수를 완료 처리할까요?', '회수 완료')

    await waitFor(() => expect(claimById('claim-return-2').status).toBe('APPROVED'))
    expect(await screen.findByText('회수를 완료했어요. 환불이 진행돼요.')).toBeInTheDocument()
  })

  it('[AC-SELLER-CLAIM-109] 상세는 수령인·품목·사유 전문을 보여주고 메모를 저장한다', async () => {
    renderClaims()

    await userEvent.click(await screen.findByText('자동 급식기 5L'))

    expect(await screen.findByText('김집사')).toBeInTheDocument()
    expect(screen.getByText('010-1234-5678')).toBeInTheDocument()
    expect(screen.getByText('(06236) 서울 강남구 테헤란로 1 101동 1001호')).toBeInTheDocument()
    expect(screen.getByText('화이트 / 5L / 1개')).toBeInTheDocument()

    const memo = screen.getByPlaceholderText('내부 운영용 메모를 적어 주세요')
    await userEvent.clear(memo)
    await userEvent.type(memo, '검수 후 전량 폐기')
    await userEvent.click(screen.getByRole('button', { name: '메모 저장' }))

    await waitFor(() => expect(claimById('claim-return-1').sellerMemo).toBe('검수 후 전량 폐기'))
    expect(await screen.findByText('메모를 저장했어요.')).toBeInTheDocument()
  })

  it('[AC-SELLER-CLAIM-114] 다른 곳에서 메모가 바뀌어도 적고 있던 내용을 지우지 않고 알린다', async () => {
    renderClaims()
    await userEvent.click(await screen.findByText('자동 급식기 5L'))

    // 행 버튼과 Drawer 버튼의 문구가 같아서(반품 승인) Drawer로 좁혀 누른다.
    const drawer = (await screen.findByRole('heading', { name: '클레임 상세' })).closest(
      '[role="dialog"]',
    ) as HTMLElement
    const memo = within(drawer).getByPlaceholderText('내부 운영용 메모를 적어 주세요')
    await userEvent.clear(memo)
    await userEvent.type(memo, '사진 확인 중')

    // 적고 있는 사이 다른 작업자가 같은 클레임 메모를 저장했다.
    updateClaimRow('claim-return-1', { sellerMemo: '다른 작업자가 적은 메모' })
    // 승인 처리가 목록·상세를 한꺼번에 무효화해 상세가 바뀐 메모와 함께 다시 온다.
    await userEvent.click(within(drawer).getByRole('button', { name: '반품 승인' }))
    await userEvent.click(screen.getByText('셀러 부담'))
    await clickConfirm('반품 승인할까요?', '반품 승인')

    expect(await screen.findByText(/다른 곳에서 이 클레임의 메모가 바뀌었어요/)).toBeInTheDocument()
    // 서버 값으로 덮어쓰면 셀러가 적던 글이 통째로 사라진다.
    expect(screen.getByPlaceholderText('내부 운영용 메모를 적어 주세요')).toHaveValue('사진 확인 중')
    expect(claimRequestCount('memo')).toBe(0)
  })
})

describe('교환 재발송', () => {
  it('[AC-SELLER-CLAIM-110] 회수가 끝난 교환은 목록에서 바로 재발송 송장을 받는다', async () => {
    renderClaims()
    const row = await rowOf('캣타워 그레이')
    expect(within(row).getByText('재발송 대기')).toBeInTheDocument()
    expect(within(row).getByText('환불 없음 (재발송)')).toBeInTheDocument()

    // 교환 상세는 환불 축을 보여주지 않는다 — refundStatus가 NONE으로 남아 있을 뿐이다.
    await userEvent.click(within(row).getByText('캣타워 그레이'))
    const drawer = (await screen.findByRole('heading', { name: '클레임 상세' })).closest(
      '[role="dialog"]',
    ) as HTMLElement
    expect(within(drawer).getByText('진행 이력')).toBeInTheDocument()
    expect(within(drawer).queryByText('환불 상태')).not.toBeInTheDocument()
    // 품목 금액도 환불을 말하지 않는다 — 서버는 교환에도 품목 환불액(120,000원)을 내리지만 집행되지
    // 않는 금액이라, 합계만 '환불 없음'으로 접고 품목에 숫자를 남기면 한 화면이 서로 다른 말을 한다.
    expect(within(drawer).getByText('단가 120,000원')).toBeInTheDocument()
    expect(within(drawer).queryByText(/환불 120,000원/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '닫기' }))

    await userEvent.click(within(row).getByRole('button', { name: '재발송 송장 등록' }))
    await userEvent.selectOptions(await screen.findByLabelText('택배사'), 'LOGEN')
    await userEvent.type(screen.getByLabelText('송장번호'), 'L123456')
    await clickConfirm('재발송 송장을 등록할까요?', '재발송 송장 등록')

    await waitFor(() => expect(claimById('claim-exchange-1').resolvedAt).not.toBeNull())
    expect(await screen.findByText('재발송 송장을 등록했어요. 교환이 끝났어요.')).toBeInTheDocument()
  })

  it('[AC-SELLER-CLAIM-111] 송장번호 형식이 택배사 패턴과 다르면 보내기 전에 막는다', async () => {
    renderClaims()
    const row = await rowOf('캣타워 그레이')

    await userEvent.click(within(row).getByRole('button', { name: '재발송 송장 등록' }))
    await userEvent.selectOptions(await screen.findByLabelText('택배사'), 'CJ')
    await userEvent.type(screen.getByLabelText('송장번호'), 'abc')

    expect(screen.getByText('선택한 택배사의 송장번호 형식과 맞지 않아요.')).toBeInTheDocument()
    await clickConfirm('재발송 송장을 등록할까요?', '재발송 송장 등록')
    // **서버가 형식을 봐 주지 않으므로 이 선검증이 유일한 방어선이다**(회수·재발송은
    // CourierMaster.validateTrackingNumber를 거치지 않는다). 그래서 상태가 아니라 요청 수로
    // 단언한다 — 상태 단언만 두면 선검증이 사라져 틀린 송장이 등록돼도 통과한다.
    expect(claimRequestCount('reship')).toBe(0)
    expect(claimById('claim-exchange-1').resolvedAt).toBeNull()
  })
})
