import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { PetFormScreen } from '@/features/pet'

// full-bleed(탭바 없음) — 펫 프로필 작성(b10-st-8). 저장하면 관리 화면(b10-st-3)으로 이동.
export const Route = createFileRoute('/mypage/pets/new')({
  component: PetNewRoute,
})

function PetNewRoute() {
  const navigate = useNavigate()
  const router = useRouter()

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/mypage/pets' })
  }

  return (
    <PetFormScreen
      target={null}
      onCancel={goBack}
      onSaved={() => navigate({ to: '/mypage/pets' })}
    />
  )
}
