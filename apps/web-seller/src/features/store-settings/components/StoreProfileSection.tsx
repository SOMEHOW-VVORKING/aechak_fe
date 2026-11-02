import { useEffect, useRef, useState } from 'react'
import { Alert, Button, EmptyState, Skeleton, StatusPill } from '@aechak/design-system/web'
import { AlertCircle } from 'lucide-react'
import { useToast } from '@/shared/hooks/useToast'
import { mergeDirty } from '@/shared/mergeDirty'
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
  const { data, isLoading, isFetching, isError, refetch, dataUpdatedAt } = useSellerStore()
  const updateStore = useUpdateSellerStore()
  const [form, setForm] = useState<StoreProfileFormValue | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const toast = useToast()
  // 폼을 시드한 응답의 시각. 1회성 플래그가 아니라 시각인 이유는 아래 effect 주석에 있다.
  const seededAtRef = useRef(0)
  // 사용자가 건드린 칸. 그 칸만 입력을 지키고 나머지는 새 서버 값으로 맞춘다.
  const dirtyKeysRef = useRef(new Set<keyof StoreProfileFormValue>())

  const store = data?.store ?? null

  /**
   * 서버 값으로 시드. 입점 신청 폼의 "1회만" 가드와 달리 **진행 중인 조회가 끝난 뒤에만**
   * 시드하고, 응답이 갱신되면 **건드리지 않은 칸은** 새 값으로 맞춘다.
   *
   * 1회성 가드로는 데이터가 지워진다: 주소 3필드는 배송 정책의 출고지와 **같은 컬럼**이다.
   * 스토어 설정을 한 번 본 뒤(캐시 A) 배송 정책에서 출고지를 B로 저장하고 돌아오면, 캐시 A가
   * 폼을 확정해 버리고 뒤늦게 도착한 B가 반영되지 않는다. 저장은 전체 덮어쓰기라 그 폼이
   * 서버 출고지를 A로 되돌린다. 입력 보존을 폼 전체로 걸면 같은 일이 다시 생긴다 — 상호만
   * 고치는 동안 도착한 새 주소가 버려지고 저장이 옛 주소를 되돌린다. 그래서 칸 단위다.
   */
  useEffect(() => {
    if (!store || isFetching || seededAtRef.current === dataUpdatedAt) return
    seededAtRef.current = dataUpdatedAt
    const next = formValueFrom(store)
    setForm(prev => (prev ? mergeDirty(next, prev, dirtyKeysRef.current) : next))
  }, [store, isFetching, dataUpdatedAt])

  function handleChange(patch: Partial<StoreProfileFormValue>) {
    for (const key of Object.keys(patch) as (keyof StoreProfileFormValue)[]) {
      dirtyKeysRef.current.add(key)
    }
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
          // 저장이 끝나면 다시 서버 값과 같아진 상태다 — 건드린 칸 기록을 비워 이후 응답이 폼을 따라오게 한다.
          dirtyKeysRef.current.clear()
          setForm(formValueFrom(applied))
          toast.show('저장했어요.')
        },
        onError: error => setActionError(storeSettingsErrorMessage(error)),
      },
    )
  }

  // `store && !form`도 로딩으로 묶는다 — 시드가 effect라 그 사이 한 프레임이 비는데,
  // 그 프레임에 아래 실패 안내를 보이면 읽기에 성공한 화면이 실패로 깜빡인다. 캐시가 있어도
  // 조회가 끝나기 전에는 폼이 없으므로, 뒤늦게 바뀐 서버 값을 입력으로 덮을 창도 사라진다.
  if (isLoading || (store != null && form == null)) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton variant="rect" className="h-10 w-64" />
        <Skeleton variant="rect" className="h-64" />
      </div>
    )
  }

  // 화면 전체가 이 한 조회에 달려 있다 — 실패를 빈 폼으로 떨구면 저장이 전체 덮어쓰기라
  // 서버에 있는 상호를 지워 버린다. 백지 대신 재시도를 둔다.
  if (isError) {
    return (
      <EmptyState
        title="스토어 정보를 불러오지 못했어요"
        description="저장은 전체 덮어쓰기라, 현재 값을 읽은 뒤에만 바꿀 수 있어요."
        action={{ label: '다시 시도', onClick: () => void refetch() }}
      />
    )
  }

  // 신청은 승인인데 서버에 스토어가 없는 상태(isSeller=false). BE 는 승인 트랜잭션에서 셀러를
  // 열므로 정상 경로에는 없지만, 읽기 실패와 뜻이 달라 문구를 따로 둔다.
  if (!store || !form) {
    return (
      <EmptyState
        title="스토어가 아직 열리지 않았어요"
        description="입점은 승인됐지만 서버에 스토어 정보가 없어요. 잠시 뒤 다시 불러와 주세요."
        action={{ label: '다시 불러오기', onClick: () => void refetch() }}
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
