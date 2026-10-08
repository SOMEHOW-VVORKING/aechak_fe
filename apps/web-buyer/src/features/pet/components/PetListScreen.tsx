import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Cat, Dog, PawPrint, Star } from 'lucide-react'
import type { PetProfile } from '@aechak/domain'
import { Button, Card, MobileScreen, Modal, Skeleton, StatusPill } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { DashedAddButton } from '@/shared/components/DashedAddButton'
import { EditDeleteActions } from '@/shared/components/EditDeleteActions'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import { petErrorMessage, usePetList, useRemovePet, useSetDefaultPet } from '@/shared/pet'
import { formatPetMeta } from '../pet.mock'
import { PetFormScreen } from './PetFormScreen'

// 펫 프로필 관리(b10-st-3). 목록(추가 → pets/new) + 인라인 편집 + 삭제 확인 Modal + 대표 펫 지정.
// 대표 유일성·삭제 시 자동 승격·정렬은 서버가 정하고, 성공하면 목록을 다시 읽어 반영한다.
export function PetListScreen() {
  const navigate = useNavigate()
  const { pets, isLoading, isError, refetch } = usePetList()
  const removePet = useRemovePet()
  const setDefault = useSetDefaultPet()

  // undefined = 목록, 객체 = 해당 펫 편집(인라인 폼).
  const [editTarget, setEditTarget] = useState<PetProfile | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<PetProfile | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const goBack = useSafeBack({ to: '/mypage' })

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

  if (isLoading) {
    return (
      <MobileScreen header={<BackAppBar onBack={goBack} title="펫 프로필" />}>
        <div className="flex flex-col gap-3.5 p-4">
          <Skeleton className="h-[52px]" />
          <Skeleton className="h-[52px]" />
        </div>
      </MobileScreen>
    )
  }

  if (isError) {
    return (
      <MobileScreen header={<BackAppBar onBack={goBack} title="펫 프로필" />}>
        <ScreenEmptyState
          icon={<PawPrint className="size-8" />}
          title="목록을 불러오지 못했어요"
          description="잠시 후 다시 시도해주세요."
          action={{ label: '다시 시도', onClick: () => void refetch() }}
        />
      </MobileScreen>
    )
  }

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="펫 프로필" />}>
      {errorMessage != null && (
        <p role="alert" className="px-4 pt-3 text-body-sm text-error-fg">
          {errorMessage}
        </p>
      )}
      {pets.length === 0 ? (
        <ScreenEmptyState
          icon={<PawPrint className="size-8" />}
          title="등록된 반려동물이 없어요"
          description="우리 아이 정보를 등록하고 관리해 보세요."
          action={{ label: '반려동물 추가', onClick: () => navigate({ to: '/mypage/pets/new' }) }}
        />
      ) : (
        <div className="flex flex-col gap-3.5 p-4">
          {pets.map(pet => (
            <PetCard
              key={pet.id}
              pet={pet}
              onEdit={() => setEditTarget(pet)}
              onDelete={() => setDeleteTarget(pet)}
              onSetDefault={() =>
                setDefault.mutate(pet.id, {
                  onSuccess: () => setErrorMessage(null),
                  onError: e => setErrorMessage(petErrorMessage(e)),
                })
              }
            />
          ))}

          <DashedAddButton
            label="반려동물 추가"
            onClick={() => navigate({ to: '/mypage/pets/new' })}
            className="h-[52px]"
          />
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
          const target = deleteTarget
          setDeleteTarget(null)
          if (target == null) return
          removePet.mutate(target.id, {
            onSuccess: () => setErrorMessage(null),
            onError: e => setErrorMessage(petErrorMessage(e)),
          })
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
  onSetDefault,
}: {
  pet: PetProfile
  onEdit: () => void
  onDelete: () => void
  onSetDefault: () => void
}) {
  const SpeciesIcon = SPECIES_ICON[pet.species]

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3.5">
        <span className="flex size-[52px] flex-none items-center justify-center overflow-hidden rounded-full bg-surface-sunken text-icon-muted">
          {pet.photoUrl ? (
            <img src={pet.photoUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
          ) : (
            <SpeciesIcon className="size-6" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-label font-semibold text-text-primary">{pet.name}</span>
            {pet.isDefault && (
              <StatusPill variant="brand" size="sm">
                <Star className="mr-0.5 inline size-3" />
                대표
              </StatusPill>
            )}
          </div>
          <p className="mt-1 text-caption text-text-tertiary">{formatPetMeta(pet)}</p>
        </div>
        <EditDeleteActions onEdit={onEdit} onDelete={onDelete} />
      </div>
      {!pet.isDefault && (
        <Button variant="secondary" size="sm" fullWidth onClick={onSetDefault} className="mt-3">
          대표 펫으로 지정
        </Button>
      )}
    </Card>
  )
}
