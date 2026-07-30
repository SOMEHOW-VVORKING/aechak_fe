import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSafeBack } from '@/shared/useSafeBack'
import { PetFormScreen } from '@/features/pet'

// full-bleed(탭바 없음) — 펫 프로필 작성(b10-st-8). 저장하면 관리 화면(b10-st-3)으로 이동.
export const Route = createFileRoute('/mypage/pets/new')({
  component: PetNewRoute,
})

function PetNewRoute() {
  const navigate = useNavigate()

  const goBack = useSafeBack({ to: '/mypage/pets' })

  return (
    <PetFormScreen
      target={null}
      onCancel={goBack}
      onSaved={() => navigate({ to: '/mypage/pets' })}
    />
  )
}
