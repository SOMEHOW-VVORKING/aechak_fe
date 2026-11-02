import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Alert, Button, EmptyState, PageHeader, Skeleton } from '@aechak/design-system/web'
import { useToast } from '@/shared/hooks/useToast'
import { mergeDirty } from '@/shared/mergeDirty'
import {
  SAVE_BLOCKED_MESSAGE,
  ShippingPolicyForm,
  formValueFrom,
  freeShippingThresholdError,
  shippingPolicyErrorMessage,
  toUpdateRequest,
  useShippingPolicy,
  useUpdateShippingPolicy,
  type ShippingPolicyFormValue,
} from '@/features/shipping-policy'

export const Route = createFileRoute('/shipping-policy/')({
  component: ShippingPolicyRoute,
})

function ShippingPolicyRoute() {
  const { data, isLoading, isFetching, isError, refetch, dataUpdatedAt } = useShippingPolicy()
  const [form, setForm] = useState<ShippingPolicyFormValue | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const toast = useToast()
  const updatePolicy = useUpdateShippingPolicy()
  const seededAtRef = useRef(0)
  const dirtyKeysRef = useRef(new Set<keyof ShippingPolicyFormValue>())

  /**
   * 서버 값으로 시드. **진행 중인 조회가 끝난 뒤에만** 시드하고, 응답이 갱신되면 사용자가
   * 건드리지 않은 칸만 새 값으로 맞춘다(건드린 칸은 입력을 지킨다).
   *
   * 1회만 시드하면 데이터가 지워진다: 출고지 3필드는 스토어 설정의 주소와 **같은 서버
   * 컬럼**이다. 이 화면을 한 번 본 뒤(캐시 A) 스토어 설정에서 주소를 B로 저장하고 돌아와
   * 배송비만 고쳐 저장하면, 캐시 A가 확정한 폼이 전체 덮어쓰기로 출고지를 A로 되돌린다.
   * 저장이 바꾼 서버 파생 값(반품지 동일 시 반품지 소거)은 onSuccess에서 직접 반영한다.
   */
  useEffect(() => {
    if (!data || isFetching || seededAtRef.current === dataUpdatedAt) return
    seededAtRef.current = dataUpdatedAt
    const next = formValueFrom(data)
    setForm(prev => (prev ? mergeDirty(next, prev, dirtyKeysRef.current) : next))
  }, [data, isFetching, dataUpdatedAt])

  function handleChange(patch: Partial<ShippingPolicyFormValue>) {
    for (const key of Object.keys(patch) as (keyof ShippingPolicyFormValue)[]) {
      dirtyKeysRef.current.add(key)
    }
    setForm(prev => (prev ? { ...prev, ...patch } : prev))
    setActionError(null)
  }

  function handleSave() {
    if (!form) return
    // 눌러 보고 나서야 400을 받는 자기모순 하나만 미리 막는다(나머지 범위는 입력 컨트롤이 막는다).
    // 사유 문장은 칸 아래 인라인이 이미 말하므로 여기서는 어느 칸인지만 가리킨다.
    if (freeShippingThresholdError(form)) {
      setActionError(SAVE_BLOCKED_MESSAGE)
      return
    }
    setActionError(null)
    updatePolicy.mutate(toUpdateRequest(form), {
      // PUT이 204라 응답 바디가 없다 — 보낸 본문에 서버 규칙(반품지 동일 시 반품지 소거)을
      // 적용한 결과를 폼에 되맞춘다. 안 하면 저장된 값과 화면이 갈린다.
      onSuccess: applied => {
        dirtyKeysRef.current.clear()
        setForm(formValueFrom(applied))
        toast.show('저장했어요.')
      },
      onError: error => setActionError(shippingPolicyErrorMessage(error)),
    })
  }

  // 조회가 끝나기 전에는 폼이 없다(캐시 값으로 확정하지 않는다) — 그 사이는 스켈레톤이다.
  if (isLoading || (data != null && form == null)) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton variant="rect" className="h-10 w-64" />
        <Skeleton variant="rect" className="h-64" />
      </div>
    )
  }

  // 화면 전체가 이 한 조회에 달려 있다 — 실패를 빈 폼으로 떨구면 저장이 전체 덮어쓰기라
  // 서버에 있는 값을 0원으로 지워 버린다. 백지 대신 재시도를 둔다.
  if (isError || !data || !form) {
    return (
      <div className="p-6">
        <PageHeader title="배송 정책" />
        <EmptyState
          title="배송 정책을 불러오지 못했어요"
          description="저장은 전체 덮어쓰기라, 현재 값을 읽은 뒤에만 바꿀 수 있어요."
          action={{ label: '다시 시도', onClick: () => void refetch() }}
        />
      </div>
    )
  }

  return (
    <div className="p-6">
      <PageHeader
        title="배송 정책"
        actions={
          <Button size="sm" onClick={handleSave} loading={updatePolicy.isPending}>
            저장
          </Button>
        }
      />

      {actionError && (
        <Alert variant="error" className="mb-4" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <p className="-mt-2 mb-4 text-body-sm text-text-tertiary">
        저장하면 입력한 내용으로 전체가 덮어써져요. 출고지 주소는 스토어 설정의 주소와 같은 값이에요.
      </p>

      {/* 저장 중에는 폼을 잠근다 — 성공 콜백이 보낸 본문으로 폼을 되맞추므로, 응답을 기다리는
          사이에 입력한 값은 "저장했어요" 토스트와 함께 조용히 사라진다. */}
      <ShippingPolicyForm value={form} onChange={handleChange} disabled={updatePolicy.isPending} />

      {toast.element}
    </div>
  )
}
