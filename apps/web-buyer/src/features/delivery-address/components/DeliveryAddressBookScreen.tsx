import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle, Loader2, MapPin, Search, SearchX, Star } from 'lucide-react'
import type { DeliveryAddress } from '@aechak/domain'
import {
  BottomFixedAction,
  BottomSheet,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  MobileScreen,
  Modal,
  Skeleton,
  StatusPill,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { AppToast } from '@/shared/components/AppToast'
import { DashedAddButton } from '@/shared/components/DashedAddButton'
import { EditDeleteActions } from '@/shared/components/EditDeleteActions'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  CONTACT_NUMBER_PATTERN,
  DELIVERY_ADDRESS_LABEL_MAX_LENGTH,
  DELIVERY_MEMO_MAX_LENGTH,
  DETAIL_ADDRESS_MAX_LENGTH,
  MAX_DELIVERY_ADDRESSES,
  RECEIVER_NAME_MAX_LENGTH,
  deliveryAddressErrorMessage,
  formatPhone,
  toPhoneDigits,
  useAddDeliveryAddress,
  useDeliveryAddresses,
  useRemoveDeliveryAddress,
  useSetDefaultDeliveryAddress,
  useUpdateDeliveryAddress,
  type DeliveryAddressInput,
} from '@/shared/delivery-address'
import { loadDaumPostcode } from '../daum-postcode'

// 주소 검색 완료 후 포커스를 옮길 상세주소 입력 id(DS Input이 그대로 <input>에 부착).
const DETAIL_ADDRESS_INPUT_ID = 'delivery-address-detail'

export interface DeliveryAddressBookScreenProps {
  /** 주문서에서 진입했으면 뒤로가기가 주문서로 복귀한다. */
  from?: string
}

// 배송지 주소록(b10-st-4). 목록(4-A) / 삭제 확인 Modal(4-B) / 추가·편집 폼(4-C)을
// 한 화면에서 mode 전환으로 처리한다. 필수 필드와 연락처 형식은 폼이 필드 아래에 안내하고 저장을 막는다.
// 최대 개수(10)와 그 밖의 거절은 서버가 판정하고(422 30500 / 400), 화면은 deliveryAddressErrorMessage 문구를 토스트로 보여준다.
export function DeliveryAddressBookScreen({ from }: DeliveryAddressBookScreenProps) {
  const navigate = useNavigate()
  const { addresses, isLoading, isError, refetch } = useDeliveryAddresses()
  const addMutation = useAddDeliveryAddress()
  const updateMutation = useUpdateDeliveryAddress()
  const removeMutation = useRemoveDeliveryAddress()
  const setDefaultMutation = useSetDefaultDeliveryAddress()

  // undefined = 목록, null = 새 배송지 추가, 객체 = 해당 배송지 편집.
  const [formTarget, setFormTarget] = useState<DeliveryAddress | null | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<DeliveryAddress | null>(null)
  // 기본 지정 중인 배송지 id — 탭한 카드만 로딩/비활성을 표시한다(공유 isPending은 전 카드에 걸린다).
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null)
  // mutation 실패 안내(422 최대 개수 / 400 검증 / 403 권한 등). 실패해도 폼·Modal은 열린 채 둔다.
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const showError = (error: unknown) => setErrorMessage(deliveryAddressErrorMessage(error))
  // 기본 배송지 삭제로 다른 배송지가 자동 승격됐을 때 안내하는 성공 토스트.
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const backToList = useSafeBack({ to: '/mypage' })
  const goBack = () => {
    if (from === 'checkout') {
      navigate({ to: '/checkout' })
      return
    }
    backToList()
  }

  const atLimit = addresses.length >= MAX_DELIVERY_ADDRESSES

  return (
    <>
      {formTarget !== undefined ? (
        <DeliveryAddressForm
          target={formTarget}
          isFirstAddress={addresses.length === 0}
          saving={addMutation.isPending || updateMutation.isPending}
          onCancel={() => setFormTarget(undefined)}
          onSave={input => {
            setErrorMessage(null)
            const opts = { onSuccess: () => setFormTarget(undefined), onError: showError }
            if (formTarget) updateMutation.mutate(formTarget.id, input, opts)
            else addMutation.mutate(input, opts)
          }}
        />
      ) : (
        <MobileScreen header={<BackAppBar onBack={goBack} title="배송지 관리" />}>
          {isLoading ? (
            <div className="flex flex-col gap-3.5 p-4">
              {[0, 1].map(i => (
                <Skeleton key={i} variant="rect" className="h-28 w-full rounded-card" />
              ))}
            </div>
          ) : isError ? (
            <ScreenEmptyState
              icon={<AlertCircle className="size-8" />}
              title="배송지를 불러오지 못했어요"
              description="네트워크 상태를 확인하고 다시 시도해주세요."
              action={{ label: '다시 시도', onClick: () => void refetch() }}
            />
          ) : addresses.length === 0 ? (
            <ScreenEmptyState
              icon={<MapPin className="size-8" />}
              title="등록된 배송지가 없어요"
              description="자주 쓰는 배송지를 추가해두면 주문이 편해요."
              action={{ label: '배송지 추가', onClick: () => setFormTarget(null) }}
            />
          ) : (
            <div className="flex flex-col gap-3.5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-body-sm text-text-secondary">등록된 배송지</span>
                <span className="tabular-nums text-body-sm text-text-tertiary">
                  {addresses.length}/{MAX_DELIVERY_ADDRESSES}
                </span>
              </div>

              {addresses.map(address => (
                <DeliveryAddressCard
                  key={address.id}
                  address={address}
                  settingDefault={settingDefaultId === address.id}
                  onEdit={() => setFormTarget(address)}
                  onDelete={() => setDeleteTarget(address)}
                  onSetDefault={() => {
                    setErrorMessage(null)
                    setSettingDefaultId(address.id)
                    setDefaultMutation.mutate(address.id, {
                      onSuccess: () => setSettingDefaultId(null),
                      onError: error => {
                        setSettingDefaultId(null)
                        showError(error)
                      },
                    })
                  }}
                />
              ))}

              <DashedAddButton label="배송지 추가" onClick={() => setFormTarget(null)} className="h-12" />
              {atLimit && (
                <p className="text-center text-caption text-text-tertiary">
                  배송지는 최대 {MAX_DELIVERY_ADDRESSES}개까지 등록할 수 있어요
                </p>
              )}
            </div>
          )}

          {/* 삭제 확인 Modal(4-B) */}
          <Modal
            open={deleteTarget != null}
            onClose={() => setDeleteTarget(null)}
            title="이 배송지를 삭제할까요?"
            description="삭제하면 되돌릴 수 없어요. 기본 배송지를 삭제하면 다른 배송지가 기본으로 지정돼요."
            confirmLabel="삭제"
            confirmVariant="danger"
            loading={removeMutation.isPending}
            onConfirm={() => {
              if (!deleteTarget) return
              setErrorMessage(null)
              removeMutation.mutate(deleteTarget.id, {
                onSuccess: promotedId => {
                  setDeleteTarget(null)
                  // 기본 삭제로 승격이 일어났을 때만 promotedId가 온다(일반 삭제는 null).
                  // 삭제 직전 목록엔 승격 대상이 아직 남아 있어 여기서 이름을 찾을 수 있다.
                  const promoted = promotedId ? addresses.find(a => a.id === promotedId) : null
                  if (promoted) {
                    setSuccessMessage(`'${promoted.label || promoted.recipient}' 배송지가 기본으로 설정됐어요`)
                  }
                },
                onError: showError,
              })
            }}
          />
        </MobileScreen>
      )}

      {/* mutation 실패 토스트(공용 AppToast) — 폼/Modal 위에 떠 실패해도 화면은 그대로 열려 있다. */}
      <AppToast
        open={errorMessage != null}
        onClose={() => setErrorMessage(null)}
        message={errorMessage ?? ''}
        variant="error"
        aboveActionBar
      />
      <AppToast
        open={successMessage != null}
        onClose={() => setSuccessMessage(null)}
        message={successMessage ?? ''}
        variant="success"
        aboveActionBar
      />
    </>
  )
}

function DeliveryAddressCard({
  address,
  settingDefault,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  address: DeliveryAddress
  settingDefault: boolean
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
}) {
  return (
    <Card selected={address.isDefault} className="p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="text-label font-semibold text-text-primary">
            {address.label || address.recipient}
          </span>
          {address.isDefault && (
            <StatusPill variant="brand" size="sm">
              <Star className="mr-0.5 inline size-3" />
              기본
            </StatusPill>
          )}
        </span>
        <EditDeleteActions onEdit={onEdit} onDelete={onDelete} />
      </div>
      <p className="text-body-sm text-text-secondary">
        {address.recipient} / {formatPhone(address.phone)}
      </p>
      <p className="mt-0.5 whitespace-pre-line text-body-sm leading-relaxed text-text-secondary">
        {address.address1}
        {address.address2 ? ` ${address.address2}` : ''}
        {address.deliveryMemo ? `\n${address.deliveryMemo}` : ''}
      </p>
      {!address.isDefault && (
        <Button
          variant="secondary"
          size="sm"
          fullWidth
          loading={settingDefault}
          disabled={settingDefault}
          onClick={onSetDefault}
          className="mt-3"
        >
          기본 배송지로 설정
        </Button>
      )}
    </Card>
  )
}

function DeliveryAddressForm({
  target,
  isFirstAddress,
  saving,
  onCancel,
  onSave,
}: {
  target: DeliveryAddress | null
  /** 등록된 배송지가 없으면 서버가 이 건을 기본으로 만든다 — 폼이 그 사실을 미리 보여준다. */
  isFirstAddress: boolean
  saving: boolean
  onCancel: () => void
  onSave: (input: DeliveryAddressInput) => void
}) {
  const [form, setForm] = useState<DeliveryAddressInput>(() => ({
    label: target?.label ?? '',
    recipient: target?.recipient ?? '',
    // 서버가 저장한 숫자열 그대로. 입력 칸은 숫자만 받는다(아래 휴대폰 onChange).
    phone: target?.phone ?? '',
    zipcode: target?.zipcode ?? '',
    address1: target?.address1 ?? '',
    address2: target?.address2 ?? '',
    deliveryMemo: target?.deliveryMemo ?? '',
    // 첫 배송지는 서버가 기본으로 만들어서 켠 채로 시작한다. 편집 시엔 기존 값 유지.
    isDefault: target?.isDefault ?? isFirstAddress,
  }))
  const [postalOpen, setPostalOpen] = useState(false)
  // 필드 안내는 한 번 벗어난 뒤에만 띄운다(손대지 않은 폼이나 첫 입력 도중에 오류가 뜨지 않게).
  const [touched, setTouched] = useState({ recipient: false, phone: false, address2: false })
  const touch = (field: keyof typeof touched) => () => setTouched(prev => ({ ...prev, [field]: true }))
  // 휴대폰 칸의 브라우저 판정(pattern 속성). 정규식을 JS로 다시 돌리지 않는다.
  const [phoneInvalid, setPhoneInvalid] = useState(false)

  const set = (patch: Partial<DeliveryAddressInput>) => setForm(prev => ({ ...prev, ...patch }))

  // 배송지 이름(label)·요청사항만 선택. 주소(우편번호/기본 주소)는 검색으로 함께 채워져 빈 칸 안내 없이 저장만 막는다.
  const recipientBlank = form.recipient.trim() === ''
  const address2Blank = form.address2.trim() === ''
  const recipientError = touched.recipient && recipientBlank ? '받는 사람 이름을 입력해주세요' : undefined
  // 형식 안내도 문의 이메일처럼 벗어난 뒤에 띄운다. 저장 잠금은 phoneInvalid가 바로 건다.
  const phoneError = !touched.phone
    ? undefined
    : form.phone === ''
      ? '휴대폰 번호를 입력해주세요'
      : phoneInvalid
        ? '휴대폰 번호 형식을 확인해주세요. 예: 01012345678'
        : undefined
  const address2Error = touched.address2 && address2Blank ? '상세 주소를 입력해주세요' : undefined
  const canSave =
    !recipientBlank && form.phone !== '' && !phoneInvalid && form.address1.trim() !== '' && !address2Blank

  return (
    <MobileScreen
      header={<BackAppBar onBack={onCancel} title={target ? '배송지 수정' : '배송지 추가'} />}
      footer={
        <BottomFixedAction
          primary={{
            label: '저장',
            onClick: () => canSave && !saving && onSave(form),
            disabled: !canSave || saving,
            loading: saving,
          }}
        />
      }
    >
      {/* maxLength/pattern은 BE AddDeliveryAddressRequest의 @Size/@Pattern과 같다(입력 단계에서 막아 서버 검증 오류가 나지 않게). */}
      <div className="flex flex-col gap-3.5 p-4">
        <Input
          label="배송지 이름 (선택)"
          placeholder="집, 회사 등"
          maxLength={DELIVERY_ADDRESS_LABEL_MAX_LENGTH}
          value={form.label}
          onChange={e => set({ label: e.target.value })}
        />
        {/* DS Input은 aria를 달지 않아 오류 칸마다 직접 넘긴다. helper(<id>-helper)는 오류가 있을 때만 렌더된다. */}
        <Input
          id="address-recipient"
          label="받는 사람"
          placeholder="받는 분 이름"
          maxLength={RECEIVER_NAME_MAX_LENGTH}
          value={form.recipient}
          onChange={e => set({ recipient: e.target.value })}
          onBlur={touch('recipient')}
          state={recipientError ? 'error' : 'default'}
          helperText={recipientError}
          aria-invalid={recipientError ? true : undefined}
          aria-describedby={recipientError ? 'address-recipient-helper' : undefined}
        />
        <Input
          id="address-phone"
          label="휴대폰 번호"
          placeholder="숫자만 입력해주세요"
          inputMode="tel"
          pattern={CONTACT_NUMBER_PATTERN}
          value={form.phone}
          onChange={e => {
            const input = e.target
            // 구분자는 서버도 같은 규칙으로 걷어내므로(normalizeContactNumber) 입력 단계에서 걷어내 숫자만 남긴다.
            // pattern 판정은 걷어낸 값에 걸려야 해서 그 값을 DOM에 먼저 반영한 뒤 validity를 읽는다.
            flushSync(() => set({ phone: toPhoneDigits(input.value) }))
            setPhoneInvalid(!input.validity.valid)
          }}
          onBlur={touch('phone')}
          state={phoneError ? 'error' : 'default'}
          helperText={phoneError}
          aria-invalid={phoneError ? true : undefined}
          aria-describedby={phoneError ? 'address-phone-helper' : undefined}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-label font-medium text-text-secondary">주소</span>
          <div className="flex items-start gap-2">
            {/* Input을 flex-1 래퍼로 감싼다 — DS Input에 flex-1을 직접 주면 field div(내부
                flex-col 안)에 걸려 높이가 40→25px로 무너진다. 래퍼로 늘려 표준 높이를 유지. */}
            <div className="flex-1">
              <Input placeholder="우편번호" value={form.zipcode} readOnly onChange={() => {}} />
            </div>
            <Button
              variant="secondary"
              size="md"
              leftIcon={<Search className="size-4" />}
              onClick={() => setPostalOpen(true)}
              className="flex-none"
            >
              우편번호 검색
            </Button>
          </div>
          <Input placeholder="기본 주소" value={form.address1} readOnly onChange={() => {}} />
          <Input
            id={DETAIL_ADDRESS_INPUT_ID}
            placeholder="상세 주소를 입력해주세요"
            maxLength={DETAIL_ADDRESS_MAX_LENGTH}
            value={form.address2}
            onChange={e => set({ address2: e.target.value })}
            onBlur={touch('address2')}
            state={address2Error ? 'error' : 'default'}
            helperText={address2Error}
            aria-invalid={address2Error ? true : undefined}
            aria-describedby={address2Error ? `${DETAIL_ADDRESS_INPUT_ID}-helper` : undefined}
          />
        </div>
        <Input
          label="배송 요청사항"
          placeholder="예) 공동현관 비밀번호 #1234, 부재 시 문 앞에 놔주세요 (선택)"
          maxLength={DELIVERY_MEMO_MAX_LENGTH}
          value={form.deliveryMemo}
          onChange={e => set({ deliveryMemo: e.target.value })}
        />
        <div className="flex flex-col gap-1">
          <Checkbox
            checked={form.isDefault}
            onChange={checked => set({ isDefault: checked })}
            disabled={isFirstAddress}
            label="기본 배송지로 설정"
          />
          {isFirstAddress && (
            <p className="text-caption text-text-tertiary">첫 배송지는 기본 배송지로 지정돼요</p>
          )}
        </div>
      </div>

      <PostalSearchSheet
        open={postalOpen}
        onClose={() => setPostalOpen(false)}
        onComplete={({ zipcode, address1 }) => {
          set({ zipcode, address1 })
          // 검색 완료 → 시트 닫힘 뒤 상세주소로 포커스 이동해 연속 입력(UXSpec focusMove).
          requestAnimationFrame(() => document.getElementById(DETAIL_ADDRESS_INPUT_ID)?.focus())
        }}
      />
    </MobileScreen>
  )
}

// 우편번호 검색 시트 — Daum 우편번호 서비스를 시트 내부 컨테이너에 embed로 띄운다. 스크립트는
// 시트를 처음 열 때 온디맨드로 로드하고, 주소를 선택하면 oncomplete(data)에서 우편번호
// (zonecode)·도로명 주소(roadAddress, 건물명 있으면 괄호로 덧붙임)를 폼에 채우고 시트를 닫는다.
function PostalSearchSheet({
  open,
  onClose,
  onComplete,
}: {
  open: boolean
  onClose: () => void
  onComplete: (result: { zipcode: string; address1: string }) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  // 콜백은 ref로 최신값을 유지해 effect가 open 변화에만 반응하게 한다(폼 리렌더마다 재임베드 방지).
  const onCompleteRef = useRef(onComplete)
  const onCloseRef = useRef(onClose)
  onCompleteRef.current = onComplete
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStatus('loading')

    // 컨테이너에 Daum 위젯을 실제로 그린다. 준비 안 됐으면 false.
    const tryEmbed = () => {
      const container = containerRef.current
      if (!container || !window.daum?.Postcode) return false
      // 재열기 시 이전 임베드(iframe)를 비우고 새로 그린다.
      container.replaceChildren()
      setStatus('ready')
      new window.daum.Postcode({
        oncomplete: data => {
          const address1 = data.buildingName
            ? `${data.roadAddress} (${data.buildingName})`
            : data.roadAddress
          onCompleteRef.current({ zipcode: data.zonecode, address1 })
          onCloseRef.current()
        },
        width: '100%',
        height: '100%',
      }).embed(container)
      return true
    }

    loadDaumPostcode()
      .then(() => {
        if (cancelled) return
        // BottomSheet는 열림 애니메이션 때문에 자식(컨테이너)을 한 틱 뒤에 마운트한다.
        // 스크립트가 캐시돼 즉시 resolve되면 이 시점엔 containerRef가 아직 null이라
        // 컨테이너가 붙을 때까지 프레임 단위로 재시도한다(약 1초 후 타임아웃).
        let tries = 0
        const tick = () => {
          if (cancelled) return
          if (tryEmbed()) return
          if (++tries > 60) {
            setStatus('error')
            return
          }
          requestAnimationFrame(tick)
        }
        tick()
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <BottomSheet open={open} onClose={onClose} title="우편번호 검색">
      {/* Daum embed iframe이 시트에 맞게 뜨도록 컨테이너 높이를 지정(시트 maxHeight 안). */}
      <div className="relative" style={{ height: 460 }}>
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-text-tertiary">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-body-sm">주소 검색을 불러오고 있어요</span>
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <EmptyState
              icon={<SearchX className="size-8" />}
              title="주소 검색을 불러오지 못했어요"
              description="네트워크 상태를 확인하고 다시 시도해주세요."
            />
          </div>
        )}
        <div ref={containerRef} className="size-full" />
      </div>
    </BottomSheet>
  )
}
