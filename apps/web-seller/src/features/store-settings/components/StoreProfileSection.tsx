import { useEffect, useRef, useState } from 'react'
import { Alert, Button, EmptyState, Skeleton, StatusPill } from '@aechak/design-system/web'
import { AlertCircle } from 'lucide-react'
import { useToast } from '@/shared/hooks/useToast'
import {
  formValueFrom,
  storeNameError,
  storeSettingsErrorMessage,
  toUpdateRequest,
  type StoreProfileFormValue,
} from '../store-profile.contract'
import { useSellerStore, useUpdateSellerStore } from '../store-profile.queries'
import { StoreProfileForm } from './StoreProfileForm'

const SELLER_STATUS_LABEL: Record<string, string> = {
  ACTIVE: '운영 중',
  PAUSED: '휴점',
  SUSPENDED: '정지',
  WITHDRAWN: '탈퇴',
  WITHDRAWAL_REQUESTED: '탈퇴 신청',
}

// 입점 승인 뒤의 스토어 설정 — GET·PUT /sellers/me/store 실연동. 예전에는 이 자리가
// "곧 제공될 예정"이라는 빈 화면이어서, 승인된 셀러가 자기 스토어 이름조차 못 봤다.
export function StoreProfileSection() {
  const { data, isLoading, isError, refetch } = useSellerStore()
  const updateStore = useUpdateSellerStore()
  const [form, setForm] = useState<StoreProfileFormValue | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const toast = useToast()
  const seededRef = useRef(false)

  const store = data?.store ?? null

  // 서버 값으로 한 번만 시드 — 저장 성공으로 캐시가 갱신돼도 재시딩하지 않아 입력을 보존한다
  // (shipping-policy·입점 신청 폼과 같은 가드). 저장이 바꾼 값은 onSuccess에서 직접 반영한다.
  useEffect(() => {
    if (store && !seededRef.current) {
      seededRef.current = true
      setForm(formValueFrom(store))
    }
  }, [store])

  function handleChange(patch: Partial<StoreProfileFormValue>) {
    setForm(prev => (prev ? { ...prev, ...patch } : prev))
    setActionError(null)
  }

  function handleSave() {
    if (!form || !store) return
    // 눌러 보고 나서야 400(10006)을 받는 자기모순 하나만 미리 막는다 — 사유는 칸 아래가 말한다.
    if (storeNameError(form)) {
      setActionError('저장하지 못했어요. 상호(스토어명)를 확인해 주세요.')
      return
    }
    setActionError(null)
    updateStore.mutate(
      { request: toUpdateRequest(form), store },
      {
        // PUT이 204라 응답 바디가 없다 — 보낸 본문에 서버 규칙(공백 제거, 빈 칸 → null)을
        // 적용한 결과로 폼을 되맞춘다. 안 하면 저장된 값과 화면이 갈린다.
        onSuccess: applied => {
          setForm(formValueFrom(applied))
          toast.show('저장했어요.')
        },
        onError: error => setActionError(storeSettingsErrorMessage(error)),
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton variant="rect" className="h-10 w-64" />
        <Skeleton variant="rect" className="h-64" />
      </div>
    )
  }

  // 화면 전체가 이 한 조회에 달려 있다 — 실패를 빈 폼으로 떨구면 저장이 전체 덮어쓰기라
  // 서버에 있는 상호를 지워 버린다. 백지 대신 재시도를 둔다.
  if (isError || !store || !form) {
    return (
      <EmptyState
        title="스토어 정보를 불러오지 못했어요"
        description="저장은 전체 덮어쓰기라, 현재 값을 읽은 뒤에만 바꿀 수 있어요."
        action={{ label: '다시 시도', onClick: () => void refetch() }}
      />
    )
  }

  const isPaused = store.status !== 'ACTIVE'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-subheading font-semibold text-text-primary">{store.storeName}</span>
          <StatusPill variant={isPaused ? 'warning' : 'success'}>
            {SELLER_STATUS_LABEL[store.status] ?? store.status}
          </StatusPill>
        </div>
        <Button size="sm" onClick={handleSave} loading={updateStore.isPending} disabled={isPaused}>
          저장
        </Button>
      </div>

      {isPaused && (
        <Alert variant="warning">
          운영 중인 스토어만 설정을 바꿀 수 있어요. 값은 볼 수 있지만 저장은 막혀 있어요.
        </Alert>
      )}

      {/* 서버가 구매확정 누적으로 올리는 값이라 셀러가 화면에서 바꿀 수 없다 — 할 일만 적는다. */}
      {store.telesalesNoticeStatus !== 'NOT_REQUIRED' && (
        <Alert variant="info" title="통신판매업 신고 대상이에요">
          <p>
            구매확정 {store.confirmedOrderCount}건을 넘겼어요. 관할 구청에 통신판매업을 신고하고
            신고증을 고객센터로 보내 주세요.
          </p>
        </Alert>
      )}

      {actionError && (
        <Alert variant="error" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <p className="flex items-center gap-1.5 text-body-sm text-text-tertiary">
        <AlertCircle className="size-3.5 flex-none" />
        저장하면 입력한 내용으로 전체가 덮어써져요. 스토어 대표·배너 이미지는 아직 이 화면에서 바꿀
        수 없고, 저장해도 지금 올라가 있는 이미지는 그대로 남아요.
      </p>

      {/* 저장 중에는 폼을 잠근다 — 성공 콜백이 보낸 본문으로 폼을 되맞추므로, 응답을 기다리는
          사이에 입력한 값은 "저장했어요" 토스트와 함께 조용히 사라진다. */}
      <StoreProfileForm value={form} onChange={handleChange} disabled={updateStore.isPending} />

      {toast.element}
    </div>
  )
}
