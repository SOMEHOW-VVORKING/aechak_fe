import { useEffect, useRef, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Loader2, MapPin, Plus, Search, SearchX, Star } from 'lucide-react'
import type { DeliveryAddress } from '@aechak/domain'
import {
  BottomFixedAction,
  BottomSheet,
  Button,
  Checkbox,
  EmptyState,
  Input,
  MobileScreen,
  Modal,
  StatusPill,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import {
  MAX_ADDRESSES,
  addAddress,
  removeAddress,
  setDefaultAddress,
  updateAddress,
  useAddresses,
  type AddressInput,
} from '@/shared/address'
import { isValidPhone, sanitizePhone } from '../address.mock'
import { loadDaumPostcode } from '../daum-postcode'

export interface AddressBookScreenProps {
  /** 주문서에서 진입했으면 뒤로가기가 주문서로 복귀한다. */
  from?: string
}

// 배송지 주소록(b10-st-4). 목록(4-A) / 삭제 확인 Modal(4-B) / 추가·편집 폼(4-C)을
// 한 화면에서 mode 전환으로 처리한다.
export function AddressBookScreen({ from }: AddressBookScreenProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const addresses = useAddresses()

  // undefined = 목록, null = 새 배송지 추가, 객체 = 해당 배송지 편집.
  const [formTarget, setFormTarget] = useState<DeliveryAddress | null | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<DeliveryAddress | null>(null)

  const goBack = () => {
    if (from === 'checkout') {
      navigate({ to: '/checkout' })
      return
    }
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/mypage' })
  }

  // 폼 모드
  if (formTarget !== undefined) {
    return (
      <AddressForm
        target={formTarget}
        onCancel={() => setFormTarget(undefined)}
        onSave={input => {
          if (formTarget) updateAddress(formTarget.id, input)
          else addAddress(input)
          setFormTarget(undefined)
        }}
      />
    )
  }

  const atLimit = addresses.length >= MAX_ADDRESSES

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="배송지 관리" />}>
      {addresses.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            icon={<MapPin className="size-8" />}
            title="등록된 배송지가 없어요"
            description="자주 쓰는 배송지를 추가해두면 주문이 편해요."
            action={{ label: '배송지 추가', onClick: () => setFormTarget(null) }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-body-sm text-text-secondary">등록된 배송지</span>
            <span className="tabular-nums text-body-sm text-text-tertiary">
              {addresses.length}/{MAX_ADDRESSES}
            </span>
          </div>

          {addresses.map(address => (
            <AddressCard
              key={address.id}
              address={address}
              onEdit={() => setFormTarget(address)}
              onDelete={() => setDeleteTarget(address)}
              onSetDefault={() => setDefaultAddress(address.id)}
            />
          ))}

          <button
            type="button"
            onClick={() => setFormTarget(null)}
            disabled={atLimit}
            className="flex h-12 items-center justify-center gap-1.5 rounded-card border border-dashed border-border-strong bg-surface-sunken text-body-sm text-text-secondary disabled:opacity-40"
          >
            <Plus className="size-[18px]" />
            배송지 추가
          </button>
          {atLimit && (
            <p className="text-center text-caption text-text-tertiary">
              배송지는 최대 {MAX_ADDRESSES}개까지 등록할 수 있어요
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
        onConfirm={() => {
          if (deleteTarget) removeAddress(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
    </MobileScreen>
  )
}

function AddressCard({
  address,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  address: DeliveryAddress
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
}) {
  return (
    <div
      className={[
        'rounded-card border bg-surface-raised p-4',
        address.isDefault ? 'border-brand-border' : 'border-border-subtle',
      ].join(' ')}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <span className="text-label font-semibold text-text-primary">{address.label}</span>
          {address.isDefault && (
            <StatusPill variant="brand" size="sm">
              <Star className="mr-0.5 inline size-3" />
              기본
            </StatusPill>
          )}
        </span>
        <span className="flex flex-none items-center gap-3 text-caption">
          <button type="button" onClick={onEdit} className="text-text-tertiary">
            수정
          </button>
          <button type="button" onClick={onDelete} className="text-error-fg">
            삭제
          </button>
        </span>
      </div>
      <p className="text-body-sm text-text-secondary">
        {address.recipient} / {address.phone}
      </p>
      <p className="mt-0.5 whitespace-pre-line text-body-sm leading-relaxed text-text-secondary">
        {address.address1}
        {address.address2 ? ` ${address.address2}` : ''}
        {address.entranceMethod ? `\n${address.entranceMethod}` : ''}
      </p>
      {!address.isDefault && (
        <Button variant="secondary" size="sm" fullWidth onClick={onSetDefault} className="mt-3">
          기본 배송지로 설정
        </Button>
      )}
    </div>
  )
}

function AddressForm({
  target,
  onCancel,
  onSave,
}: {
  target: DeliveryAddress | null
  onCancel: () => void
  onSave: (input: AddressInput) => void
}) {
  const [form, setForm] = useState<AddressInput>(() => ({
    label: target?.label ?? '',
    recipient: target?.recipient ?? '',
    phone: target?.phone ?? '',
    zipcode: target?.zipcode ?? '',
    address1: target?.address1 ?? '',
    address2: target?.address2 ?? '',
    entranceMethod: target?.entranceMethod ?? '',
    // 첫 배송지가 아니라면 기본값 체크는 사용자가 선택. 편집 시 기존 값 유지.
    isDefault: target?.isDefault ?? false,
  }))
  const [postalOpen, setPostalOpen] = useState(false)

  const set = (patch: Partial<AddressInput>) => setForm(prev => ({ ...prev, ...patch }))

  // 휴대폰: 숫자/하이픈만 입력되게 걸러내고, 값이 있는데 형식이 틀리면 에러 상태를 표시한다.
  const phoneInvalid = form.phone.trim() !== '' && !isValidPhone(form.phone)

  const canSave =
    form.label.trim() !== '' &&
    form.recipient.trim() !== '' &&
    isValidPhone(form.phone) &&
    form.address1.trim() !== ''

  return (
    <MobileScreen
      header={<BackAppBar onBack={onCancel} title={target ? '배송지 수정' : '배송지 추가'} />}
      footer={
        <BottomFixedAction
          primary={{
            label: '저장',
            onClick: () => canSave && onSave({ ...form, entranceMethod: form.entranceMethod?.trim() || undefined }),
            disabled: !canSave,
          }}
        />
      }
    >
      <div className="flex flex-col gap-3.5 p-4">
        <Input
          label="배송지 이름"
          placeholder="집, 회사 등"
          value={form.label}
          onChange={e => set({ label: e.target.value })}
        />
        <Input
          label="받는 사람"
          placeholder="받는 분 이름"
          value={form.recipient}
          onChange={e => set({ recipient: e.target.value })}
        />
        <Input
          label="휴대폰 번호"
          placeholder="010-0000-0000"
          inputMode="tel"
          value={form.phone}
          onChange={e => set({ phone: sanitizePhone(e.target.value) })}
          state={phoneInvalid ? 'error' : 'default'}
          helperText={phoneInvalid ? '숫자로 된 휴대폰 번호를 입력해주세요' : undefined}
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
            placeholder="상세 주소를 입력해주세요"
            value={form.address2}
            onChange={e => set({ address2: e.target.value })}
          />
        </div>
        <Input
          label="공동현관 출입 방법"
          placeholder="예) 공동현관 비밀번호 #1234 (선택)"
          value={form.entranceMethod ?? ''}
          onChange={e => set({ entranceMethod: e.target.value })}
        />
        <Checkbox
          checked={form.isDefault}
          onChange={checked => set({ isDefault: checked })}
          label="기본 배송지로 설정"
        />
      </div>

      <PostalSearchSheet
        open={postalOpen}
        onClose={() => setPostalOpen(false)}
        onComplete={({ zipcode, address1 }) => set({ zipcode, address1 })}
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
    loadDaumPostcode()
      .then(() => {
        const container = containerRef.current
        if (cancelled || !container || !window.daum?.Postcode) {
          if (!cancelled) setStatus('error')
          return
        }
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
