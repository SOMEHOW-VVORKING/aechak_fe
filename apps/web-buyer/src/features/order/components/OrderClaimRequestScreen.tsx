import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { BuyerClaimType, BuyerOrderItem } from '@aechak/domain'
import {
  Alert,
  BottomFixedAction,
  Button,
  Card,
  Checkbox,
  MobileScreen,
  Modal,
  Skeleton,
  Textarea,
} from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { HomeAction } from '@/shared/components/HomeAction'
import { RadioList } from '@/shared/components/RadioList'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { formatKRW } from '@/shared/formatKRW'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  RETURN_WINDOW_DAYS,
  claimReasonsErrorMessage,
  claimableOrderItems,
  isClaimableByStatus,
  isOrderNotFound,
  needsReasonDetail,
  orderErrorMessage,
  requestClaimErrorMessage,
  useClaimReasons,
  useOrderClaims,
  useRequestClaim,
} from '@/shared/order'
import { useOrder } from '../order.queries'
import { CLAIM_ACTION_LABEL, CLAIM_TYPE_LABEL } from '../order.mock'

const REASON_DETAIL_MAX = 500

// 유형별 안내·확인 문구. 서버가 받는 조건이 유형마다 달라(be ClaimType.requestableFrom) 안내도 갈린다.
const COPY: Record<
  BuyerClaimType,
  {
    notice: { title: string; body: string }
    confirm: { title: string; description: string; label: string }
    /** 요청을 받지 않는 상태일 때의 설명. */
    blocked: string
    done: { title: string; body: string }
  }
> = {
  cancel: {
    notice: {
      title: '발송 전이라 취소를 신청할 수 있어요',
      body: '상품이 출고되면 취소 대신 반품으로 받아요.',
    },
    confirm: {
      title: '주문을 취소할까요?',
      description:
        '취소를 신청하면 판매자 확인 뒤 환불이 진행돼요. 신청한 상품은 다시 주문해야 해요.',
      label: '취소 신청할게요',
    },
    blocked: '이미 발송돼서 주문을 취소할 수 없어요. 배송완료 뒤에 반품을 신청해 주세요.',
    done: { title: '취소를 접수했어요', body: '판매자가 확인하면 환불이 진행돼요.' },
  },
  return: {
    notice: {
      title: `배송완료 뒤 ${RETURN_WINDOW_DAYS}일 안에 반품을 신청할 수 있어요`,
      body: '판매자가 승인하면 회수가 시작되고, 상품을 받은 뒤 환불이 진행돼요.',
    },
    confirm: {
      title: '반품을 신청할까요?',
      description: '판매자가 승인하면 회수가 시작돼요. 상품과 구성품을 그대로 보관해 주세요.',
      label: '반품 신청할게요',
    },
    blocked: `반품은 배송완료 뒤 ${RETURN_WINDOW_DAYS}일 안에만 신청할 수 있어요.`,
    done: { title: '반품을 접수했어요', body: '판매자가 승인하면 회수가 시작돼요.' },
  },
  exchange: {
    notice: {
      title: `배송완료 뒤 ${RETURN_WINDOW_DAYS}일 안에 교환을 신청할 수 있어요`,
      body: '교환은 환불 없이 같은 상품을 다시 보내드려요.',
    },
    confirm: {
      title: '교환을 신청할까요?',
      description: '판매자가 승인하면 회수 뒤 같은 상품을 다시 보내드려요.',
      label: '교환 신청할게요',
    },
    blocked: `교환은 배송완료 뒤 ${RETURN_WINDOW_DAYS}일 안에만 신청할 수 있어요.`,
    done: { title: '교환을 접수했어요', body: '판매자가 승인하면 회수 뒤 다시 보내드려요.' },
  },
}

/**
 * 클레임(취소·반품·교환) 요청 화면.
 *
 * 사유 선택지는 **서버(GET /claims/reasons)가 코드·문구·상세필수까지 내려준다** — 화면이 어휘를 들고
 * 있지 않다. 그 경로는 SCRUM-273(BE #150)이 머지되기 전까지 dev에 없어 404가 오는데, 그때도 상세·내역
 * 화면은 멀쩡히 돌아가고 이 화면만 "아직 받을 준비가 안 됐어요"로 떨어진다(하드코딩 선택지 금지 —
 * 없는 어휘로 보내면 머지 뒤 400 50412로 거절되므로 가짜 선택지는 실패를 뒤로 미루기만 한다).
 *
 * 대상 품목은 **전량만** 보낼 수 있다(서버가 부분 수량을 422 50410으로 거절한다). 그래서 수량 입력이
 * 없고 품목 체크박스만 있으며, 보낼 때는 생략하지 않고 고른 품목을 명시한다 — 생략은 "이미 클레임이
 * 걸린 품목까지 전부"를 뜻해 409가 된다.
 */
export function OrderClaimRequestScreen({
  orderId,
  claimType,
}: {
  orderId: string
  claimType: BuyerClaimType
}) {
  const navigate = useNavigate()
  const { order, isPending, isSuccess, isError, error, refetch } = useOrder(orderId)
  const reasons = useClaimReasons()
  // 대상 품목은 내역으로 가른다 — 서버가 중복을 품목 단위로 막으므로 진행 중 건이 잡지 않은 품목은
  // 아직 신청할 수 있다(취소는 요청 시점에 itemStatus를 바꾸지 않아 내역 없이는 가릴 수 없다).
  const claims = useOrderClaims(orderId)
  const { request, isPending: isRequesting } = useRequestClaim()

  const [selected, setSelected] = useState<Set<number> | null>(null)
  const [reasonCode, setReasonCode] = useState('')
  const [reasonDetail, setReasonDetail] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [done, setDone] = useState<{ refundAmount: number } | null>(null)
  const [toast, setToast] = useState({ open: false, message: '' })

  const copy = COPY[claimType]
  const goDetail = () =>
    navigate({ to: '/orders/$orderId', params: { orderId }, replace: true })
  const goBack = useSafeBack({ to: '/orders/$orderId', params: { orderId } })

  const knownClaims = claims.isPending || claims.isError ? undefined : claims.claims
  // null은 "잡힌 품목을 가릴 수 없다"는 뜻이라 빈 배열과 다르게 다룬다(아래 분기가 가른다).
  const available = useMemo(
    () => (order ? claimableOrderItems(order, knownClaims) : null),
    [order, knownClaims],
  )
  const items = available ?? []
  // 선택을 한 번도 건드리지 않았으면 전량 선택이 기본값이다(대개 주문 전체를 되돌린다).
  const checked = selected ?? new Set(items.map(item => item.orderItemId))

  const options = reasons.catalog[claimType]
  const detailRequired = needsReasonDetail(options, reasonCode)

  const toggle = (orderItemId: number) => {
    const next = new Set(checked)
    if (next.has(orderItemId)) next.delete(orderItemId)
    else next.add(orderItemId)
    setSelected(next)
  }

  const canSubmit =
    checked.size > 0 &&
    reasonCode !== '' &&
    (!detailRequired || reasonDetail.trim().length > 0) &&
    !reasons.isError

  const submit = () => {
    // 확인 버튼은 isRequesting이면 disabled가 되지만 같은 틱의 두 번째 클릭은 그 리렌더 전에 들어온다.
    if (!order || isRequesting) return
    setConfirmOpen(false)
    request(
      {
        orderId,
        request: {
          claimType,
          reasonCode,
          ...(reasonDetail.trim() ? { reasonDetail: reasonDetail.trim() } : {}),
          // 고른 품목을 명시한다 — 전량이어야 하므로 수량은 주문 수량 그대로.
          items: items
            .filter(item => checked.has(item.orderItemId))
            .map(item => ({ orderItemId: item.orderItemId, quantity: item.quantity })),
        },
      },
      {
        onSuccess: refundAmount => setDone({ refundAmount }),
        onError: requestError =>
          setToast({ open: true, message: requestClaimErrorMessage(requestError) }),
      },
    )
  }

  /**
   * 본문만 분기하고 확인 Modal·토스트는 어느 분기에서도 함께 렌더한다 — 요청 어댑터가 onSettled에서
   * 주문 캐시를 무효화하므로 성공·실패 콜백이 재조회 뒤에 돈다. 그 재조회가 실패해 오류 분기로
   * 떨어지면 본문 안의 토스트는 함께 사라져 **접수 결과를 아무도 못 보게 된다**.
   */
  const screen = (content: ReactNode, footer?: ReactNode) => (
    <MobileScreen
      header={
        <BackAppBar
          onBack={goBack}
          title={CLAIM_ACTION_LABEL[claimType]}
          actions={<HomeAction />}
        />
      }
      footer={footer}
    >
      {content}

      {confirmOpen && (
        <Modal
          open
          onClose={() => setConfirmOpen(false)}
          title={copy.confirm.title}
          description={copy.confirm.description}
          confirmLabel={copy.confirm.label}
          cancelLabel="닫기"
          onConfirm={submit}
          loading={isRequesting}
        />
      )}

      <AppToast
        open={toast.open}
        message={toast.message}
        variant="error"
        aboveActionBar
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
      />
    </MobileScreen>
  )

  const skeleton = (
    <div className="flex flex-col gap-3 p-4" aria-busy="true">
      <Skeleton variant="rect" className="h-16 w-full" />
      <Skeleton variant="rect" className="h-32 w-full" />
      <Skeleton variant="rect" className="h-40 w-full" />
    </div>
  )

  /**
   * 접수 완료 — **조회 분기보다 먼저 그린다.** 요청 어댑터가 onSettled에서 주문 캐시를 무효화하므로
   * 성공 직후 상세 재조회가 돌고, 그 재조회가 실패하면 아래 오류 분기가 "주문을 불러오지 못했어요"로
   * 덮어 접수 성공과 **서버가 확정한 환불 예정 금액을 아무도 못 보게 된다**(그 금액은 이 응답에만 있다).
   * 서버가 201을 준 사실은 이후 조회 결과와 무관하다.
   */
  if (done) {
    return screen(
      <div className="flex flex-col gap-4 p-4">
        <Alert variant="info" title={copy.done.title}>
          {copy.done.body}
        </Alert>
        {claimType !== 'exchange' && (
          <Card className="flex items-baseline justify-between p-4">
            <span className="text-label font-semibold text-text-primary">환불 예정 금액</span>
            <span className="text-price-sm font-bold text-text-price">
              {formatKRW(done.refundAmount)}
            </span>
          </Card>
        )}
        <Button variant="primary" size="lg" fullWidth onClick={goDetail}>
          주문 상세로
        </Button>
      </div>,
    )
  }

  if (isPending) {
    return screen(skeleton)
  }

  if ((isError && isOrderNotFound(error)) || (isSuccess && order == null)) {
    return screen(
      <ScreenEmptyState
        title="주문을 찾을 수 없어요"
        description="삭제되었거나 주소가 올바르지 않은 주문이에요."
        action={{ label: '주문 내역으로', onClick: () => navigate({ to: '/orders' }) }}
      />,
    )
  }

  if (isError || order == null) {
    return screen(
      <ScreenEmptyState
        title="주문을 불러오지 못했어요"
        description={orderErrorMessage(error)}
        action={{ label: '다시 시도', onClick: refetch }}
      />,
    )
  }

  // 진행 중 건이 있으면 그 건이 잡은 품목을 내역으로만 가릴 수 있다 — 도착 전에 폼을 그리지 않는다.
  if (order.activeClaim != null && claims.isPending) {
    return screen(skeleton)
  }

  /**
   * 진행 중 건 때문에 고를 대상이 없는 경우 — 남은 품목이 하나도 없거나(전량이 잡혔다) 내역을 못 읽어
   * 어느 품목이 잡혔는지 가릴 수 없는 경우다. 서버 409를 유도하지 않고 사유를 먼저 적는다.
   */
  const activeClaim = order.activeClaim
  if (available == null || (available.length === 0 && activeClaim != null)) {
    return screen(
      <div className="flex flex-col gap-4 p-4">
        <Alert variant="warning" title="이미 진행 중인 요청이 있어요">
          {activeClaim ? `${CLAIM_TYPE_LABEL[activeClaim.claimType]} 요청이 ` : '진행 중인 요청이 '}
          처리되는 동안에는 이 주문의 상품을 새로 신청할 수 없어요. 진행 상황은 주문 상세에서 볼 수
          있어요.
        </Alert>
        <Button variant="secondary" size="lg" fullWidth onClick={goDetail}>
          주문 상세로
        </Button>
      </div>,
    )
  }

  if (!isClaimableByStatus(order, claimType)) {
    return screen(
      <div className="flex flex-col gap-4 p-4">
        <Alert variant="warning" title={`${CLAIM_ACTION_LABEL[claimType]}을 할 수 없어요`}>
          {copy.blocked}
        </Alert>
        <Button variant="secondary" size="lg" fullWidth onClick={goDetail}>
          주문 상세로
        </Button>
      </div>,
    )
  }

  // 모든 품목이 이미 처리됐거나 다른 클레임에 잡혀 있으면 고를 대상이 없다(서버도 409로 거절한다).
  if (items.length === 0) {
    return screen(
      <div className="flex flex-col gap-4 p-4">
        <Alert variant="warning" title="신청할 수 있는 상품이 없어요">
          이 주문의 상품은 이미 처리됐거나 다른 요청이 진행 중이에요.
        </Alert>
        <Button variant="secondary" size="lg" fullWidth onClick={goDetail}>
          주문 상세로
        </Button>
      </div>,
    )
  }

  return screen(
    <div className="flex flex-col gap-4 p-4">
      <Alert variant="info" title={copy.notice.title}>
        {copy.notice.body}
      </Alert>

      <ClaimItemPicker items={items} checked={checked} onToggle={toggle} />

      <section className="flex flex-col gap-2">
        <span className="text-label font-semibold text-text-primary">
          {CLAIM_TYPE_LABEL[claimType]} 사유
        </span>
        <ClaimReasonPicker
          claimType={claimType}
          options={options}
          value={reasonCode}
          onChange={code => {
            setReasonCode(code)
            // 사유를 바꾸면 이전 사유에 쓴 상세 설명은 맥락이 사라진다.
            setReasonDetail('')
          }}
          isPending={reasons.isPending}
          isError={reasons.isError}
          errorMessage={claimReasonsErrorMessage(reasons.error)}
          onRetry={reasons.refetch}
        />
        {detailRequired && (
          <Textarea
            label="상세 사유"
            value={reasonDetail}
            onChange={setReasonDetail}
            maxLength={REASON_DETAIL_MAX}
            placeholder="어떤 점이 문제였는지 알려 주시면 빠르게 처리할 수 있어요."
          />
        )}
      </section>

      <p className="text-caption text-text-tertiary">
        상품은 주문한 수량 전부를 기준으로 신청해요. 환불 금액은 판매자 확인 뒤 확정돼요.
      </p>
    </div>,
    <BottomFixedAction
      primary={{
        label: `${CLAIM_ACTION_LABEL[claimType]}하기`,
        onClick: () => setConfirmOpen(true),
        disabled: !canSubmit,
        loading: isRequesting,
      }}
    />,
  )
}

/**
 * 대상 품목 선택. 체크박스와 텍스트 버튼을 **형제**로 두고 각각 같은 토글을 부른다 —
 * DS `Checkbox`가 자체 `<label>`을 그리므로 바깥을 또 label로 감싸면 탭이 이중 토글로 상쇄된다.
 * 품목이 하나뿐이면 고를 것이 없어 체크박스 대신 읽기 전용으로 적는다(죽은 컨트롤 금지).
 */
function ClaimItemPicker({
  items,
  checked,
  onToggle,
}: {
  items: BuyerOrderItem[]
  checked: Set<number>
  onToggle: (orderItemId: number) => void
}) {
  const single = items.length === 1
  return (
    <section className="flex flex-col gap-2">
      <span className="text-label font-semibold text-text-primary">
        {single ? '신청 상품' : '신청할 상품'}
      </span>
      <Card className="flex flex-col gap-3 p-4">
        {items.map(item => (
          <div key={item.orderItemId} className="flex items-start gap-2.5">
            {!single && (
              <Checkbox
                checked={checked.has(item.orderItemId)}
                onChange={() => onToggle(item.orderItemId)}
              />
            )}
            {single ? (
              <ItemText item={item} />
            ) : (
              <button
                type="button"
                onClick={() => onToggle(item.orderItemId)}
                className="min-w-0 flex-1 text-left"
              >
                <ItemText item={item} />
              </button>
            )}
          </div>
        ))}
      </Card>
      {!single && checked.size === 0 && (
        <p className="text-caption text-danger-fg">상품을 하나 이상 선택해 주세요.</p>
      )}
    </section>
  )
}

function ItemText({ item }: { item: BuyerOrderItem }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="line-clamp-2 text-body-sm text-text-primary">{item.name}</p>
      <p className="mt-0.5 text-caption text-text-tertiary">
        {item.option} / {item.quantity}개
      </p>
    </div>
  )
}

/**
 * 사유 선택지 — 서버가 준 목록만 그린다. 실패하면 하드코딩 폴백을 되살리지 않고 사실을 알리고
 * 다시 시도를 둔다(이 분기에서는 제출 버튼이 잠긴다).
 */
function ClaimReasonPicker({
  claimType,
  options,
  value,
  onChange,
  isPending,
  isError,
  errorMessage,
  onRetry,
}: {
  claimType: BuyerClaimType
  options: { code: string; label: string }[]
  value: string
  onChange: (code: string) => void
  isPending: boolean
  isError: boolean
  errorMessage: string
  onRetry: () => void
}) {
  if (isPending) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton variant="text" className="h-6 w-2/3" />
        <Skeleton variant="text" className="h-6 w-1/2" />
        <Skeleton variant="text" className="h-6 w-3/5" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="warning" title={errorMessage}>
          사유를 고를 수 없어 지금은 접수할 수 없어요. 잠시 후 다시 시도해 주세요.
        </Alert>
        <Button variant="secondary" size="md" onClick={onRetry}>
          다시 시도
        </Button>
      </div>
    )
  }
  // 조회는 됐는데 이 유형의 선택지가 비어 있는 경우 — 서버가 그 유형을 아직 받지 않는다는 뜻이다.
  if (options.length === 0) {
    return (
      <Alert variant="warning" title="고를 수 있는 사유가 없어요">
        {CLAIM_TYPE_LABEL[claimType]} 사유가 아직 준비되지 않았어요. 고객센터로 문의해 주세요.
      </Alert>
    )
  }
  return (
    <RadioList
      name="claim-reason"
      options={options.map(option => ({ value: option.code, label: option.label }))}
      value={value}
      onChange={onChange}
    />
  )
}
