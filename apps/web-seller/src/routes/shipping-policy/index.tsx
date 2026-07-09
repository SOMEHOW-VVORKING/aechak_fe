import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import type { ShippingPolicy } from '@aechak/domain'
import { Button, PageHeader, Toast } from '@aechak/design-system/web'
import { ShippingPolicyForm, useShippingPolicy, useUpdateShippingPolicy } from '@/features/shipping-policy'

export const Route = createFileRoute('/shipping-policy/')({
  component: ShippingPolicyRoute,
})

function ShippingPolicyRoute() {
  const { data, isLoading } = useShippingPolicy()
  const [form, setForm] = useState<ShippingPolicy | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
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
      onSuccess: () => setToastMessage('저장했어요.'),
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

      {toastMessage && (
        <Toast open onClose={() => setToastMessage(null)} message={toastMessage} variant="success" />
      )}
    </div>
  )
}
