import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Cat, Dog, PawPrint, Plus, Star } from 'lucide-react'
import type { PetProfile } from '@aechak/domain'
import { Button, EmptyState, MobileScreen, Modal, StatusPill } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { removePet, setRepresentativePet } from '@/shared/pet'
import { usePetList } from '../pet.queries'
import { formatPetMeta } from '../pet.mock'
import { PetFormScreen } from './PetFormScreen'

// 펫 프로필 관리(b10-st-3). 목록(추가 → pets/new) + 인라인 편집 + 삭제 확인 Modal + 대표 펫 지정.
export function PetListScreen() {
  const navigate = useNavigate()
  const router = useRouter()
  const pets = usePetList()

  // undefined = 목록, 객체 = 해당 펫 편집(인라인 폼).
  const [editTarget, setEditTarget] = useState<PetProfile | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<PetProfile | null>(null)

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/mypage' })
  }

  // 편집 모드(인라인 폼)
  if (editTarget !== undefined) {
    return (
      <PetFormScreen
        target={editTarget}
        onCancel={() => setEditTarget(undefined)}
        onSaved={() => setEditTarget(undefined)}
      />
    )
  }

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="펫 프로필" />}>
      {pets.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            icon={<PawPrint className="size-8" />}
            title="등록된 반려동물이 없어요"
            description="우리 아이 정보를 등록하고 관리해 보세요."
            action={{ label: '반려동물 추가', onClick: () => navigate({ to: '/mypage/pets/new' }) }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 p-4">
          {pets.map(pet => (
            <PetCard
              key={pet.id}
              pet={pet}
              onEdit={() => setEditTarget(pet)}
              onDelete={() => setDeleteTarget(pet)}
              onSetRepresentative={() => setRepresentativePet(pet.id)}
            />
          ))}

          <button
            type="button"
            onClick={() => navigate({ to: '/mypage/pets/new' })}
            className="flex h-[52px] items-center justify-center gap-1.5 rounded-card border border-dashed border-border-strong bg-surface-sunken text-body-sm text-text-secondary"
          >
            <Plus className="size-[18px]" />
            반려동물 추가
          </button>
        </div>
      )}

      {/* 삭제 확인 Modal */}
      <Modal
        open={deleteTarget != null}
        onClose={() => setDeleteTarget(null)}
        title="이 반려동물을 삭제할까요?"
        description="삭제하면 되돌릴 수 없어요. 대표 펫을 삭제하면 다른 펫이 대표로 지정돼요."
        confirmLabel="삭제"
        confirmVariant="danger"
        onConfirm={() => {
          if (deleteTarget) removePet(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />
    </MobileScreen>
  )
}

const SPECIES_ICON = {
  dog: Dog,
  cat: Cat,
} as const

function PetCard({
  pet,
  onEdit,
  onDelete,
  onSetRepresentative,
}: {
  pet: PetProfile
  onEdit: () => void
  onDelete: () => void
  onSetRepresentative: () => void
}) {
  const SpeciesIcon = SPECIES_ICON[pet.species]

  return (
    <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
      <div className="flex items-start gap-3.5">
        <span className="flex size-[52px] flex-none items-center justify-center overflow-hidden rounded-full bg-surface-sunken text-icon-muted">
          {pet.photoUrl ? (
            <img src={pet.photoUrl} alt="" className="size-full object-cover" />
          ) : (
            <SpeciesIcon className="size-6" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-label font-semibold text-text-primary">{pet.name}</span>
            {pet.isRepresentative && (
              <StatusPill variant="brand" size="sm">
                <Star className="mr-0.5 inline size-3" />
                대표
              </StatusPill>
            )}
          </div>
          <p className="mt-1 text-caption text-text-tertiary">{formatPetMeta(pet)}</p>
        </div>
        <span className="flex flex-none items-center gap-3 text-caption">
          <button type="button" onClick={onEdit} className="text-text-tertiary">
            수정
          </button>
          <button type="button" onClick={onDelete} className="text-error-fg">
            삭제
          </button>
        </span>
      </div>
      {!pet.isRepresentative && (
        <Button variant="secondary" size="sm" fullWidth onClick={onSetRepresentative} className="mt-3">
          대표 펫으로 지정
        </Button>
      )}
    </div>
  )
}
