import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { ShippingPolicy } from '@aechak/domain'
import { Button, PageHeader } from '@aechak/design-system/web'
import { useToast } from '@/shared/hooks/useToast'
import { ShippingPolicyForm, useShippingPolicy, useUpdateShippingPolicy } from '@/features/shipping-policy'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/shipping-policy/')({
  component: ShippingPolicyGate,
})

// 운영 진입 차단 스위치. seller 모듈에 배송 정책 API가 없어 조회·저장이 전부 목업이다('저장했어요'
// 토스트까지 띄우던 상태). 아래 ShippingPolicyRoute는 서버가 생기면 queries 층만 바꿔 그대로 살릴 배선.
const SERVER_SHIPPING_POLICY_AVAILABLE = false

function ShippingPolicyGate() {
  if (!SERVER_SHIPPING_POLICY_AVAILABLE) {
    return (
      <UnavailableScreen
        title="배송 정책"
        message="배송 정책 설정은 준비 중이에요"
        description="배송 정책 조회·저장은 서버가 준비되면 열어 둘게요."
      />
    )
  }
  return <ShippingPolicyRoute />
}

function ShippingPolicyRoute() {
  const { data, isLoading } = useShippingPolicy()
  const [form, setForm] = useState<ShippingPolicy | null>(null)
  const toast = useToast()
  const updatePolicy = useUpdateShippingPolicy()

  useEffect(() => {
    if (data && !form) setForm(data)
  }, [data, form])

  function handleChange(patch: Partial<ShippingPolicy>) {
    setForm(prev => (prev ? { ...prev, ...patch } : prev))
  }

  function handleSave() {
    if (!form) return
    const payload = form.sameAsOrigin ? { ...form, returnAddress: form.originAddress } : form
    updatePolicy.mutate(payload, {
      onSuccess: () => toast.show('저장했어요.'),
    })
  }

  return (
    <div className="p-6">
      <PageHeader
        title="배송 정책"
        actions={
          <Button size="sm" onClick={handleSave} loading={updatePolicy.isPending} disabled={!form || isLoading}>
            저장
          </Button>
        }
      />

      {form && <ShippingPolicyForm value={form} onChange={handleChange} />}

      {toast.element}
    </div>
  )
}
