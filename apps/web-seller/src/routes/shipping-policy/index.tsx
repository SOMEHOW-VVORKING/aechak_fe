import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Alert, Button, EmptyState, PageHeader, Skeleton } from '@aechak/design-system/web'
import { useToast } from '@/shared/hooks/useToast'
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
  const { data, isLoading, isError, refetch } = useShippingPolicy()
  const [form, setForm] = useState<ShippingPolicyFormValue | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const toast = useToast()
  const updatePolicy = useUpdateShippingPolicy()
  const seededRef = useRef(false)

  // 서버 값으로 한 번만 시드 — 저장 성공으로 캐시가 갱신돼도 재시딩하지 않아 입력을 보존한다
  // (store-settings와 같은 가드). 저장이 바꾼 서버 파생 값은 onSuccess에서 직접 반영한다.
  useEffect(() => {
    if (data && !seededRef.current) {
      seededRef.current = true
      setForm(formValueFrom(data))
    }
  }, [data])

  function handleChange(patch: Partial<ShippingPolicyFormValue>) {
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
        setForm(formValueFrom(applied))
        toast.show('저장했어요.')
      },
      onError: error => setActionError(shippingPolicyErrorMessage(error)),
    })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton variant="rect" className="h-10 w-64" />
        <Skeleton variant="rect" className="h-64" />
      </div>
    )
  }

  // 화면 전체가 이 한 조회에 달려 있다 — 실패를 빈 폼으로 떨구면 저장이 전체 덮어쓰기라
  // 서버에 있는 값을 0원으로 지워 버린다. 백지 대신 재시도를 둔다.
  if (isError || !form) {
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

      <ShippingPolicyForm value={form} onChange={handleChange} />

      {toast.element}
    </div>
  )
}
