import { useState } from 'react'
import type { PetProfile, PetSpecies } from '@aechak/domain'
import {
  BottomFixedAction,
  Checkbox,
  Input,
  MobileScreen,
  PhotoUpload,
  SegmentedControl,
  Select,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { placeholderImage } from '@/shared/catalog'
import type { PetInput } from '@/shared/pet'
import { useSavePet } from '../pet.queries'
import {
  BIRTH_MONTH_OPTIONS,
  BIRTH_YEAR_OPTIONS,
  SPECIES_OPTIONS,
  breedOptions,
} from '../pet.mock'

export interface PetFormScreenProps {
  /** 편집 대상 펫. null이면 새 펫 작성. */
  target: PetProfile | null
  /** 뒤로가기/취소. */
  onCancel: () => void
  /** 저장 완료 후(관리 화면으로 이동/목록 복귀). */
  onSaved: () => void
}

// 펫 프로필 작성/수정(b10-st-8). 종·이름·품종·생년월·체중·사진 수집. 맞춤 추천 연동은 OFF(수집만).
// pets/new 라우트와 관리 화면의 인라인 편집이 함께 재사용한다.
export function PetFormScreen({ target, onCancel, onSaved }: PetFormScreenProps) {
  const savePet = useSavePet()

  const [species, setSpecies] = useState<PetSpecies>(target?.species ?? 'cat')
  const [name, setName] = useState(target?.name ?? '')
  const [breed, setBreed] = useState(target?.breed ?? '')
  const [birthYear, setBirthYear] = useState(target?.birthYear != null ? String(target.birthYear) : '')
  const [birthMonth, setBirthMonth] = useState(target?.birthMonth != null ? String(target.birthMonth) : '')
  // 생년월 '모름' — 켜면 생년/생월을 비활성·비우고 둘 다 undefined로 저장한다. 편집 시 birthYear가
  // 없던 펫(=모름으로 저장된 펫)이면 켠 상태로 프리필한다.
  const [unknownBirth, setUnknownBirth] = useState(target != null && target.birthYear == null)
  const [weight, setWeight] = useState(target?.weightKg != null ? String(target.weightKg) : '')
  const [photos, setPhotos] = useState<string[]>(target?.photoUrl ? [target.photoUrl] : [])

  const handleSpeciesChange = (value: string) => {
    const next = value as PetSpecies
    setSpecies(next)
    // 종이 바뀌면 새 종에 없는 품종 선택은 초기화한다.
    if (breed && !breedOptions(next).some(o => o.value === breed)) setBreed('')
  }

  const handleAddPhoto = (files: File[]) => {
    const file = files[0]
    const url =
      file && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(file)
        : placeholderImage(180)
    setPhotos([url])
  }

  const canSave = name.trim() !== ''

  const handleSave = () => {
    if (!canSave) return
    const parsedWeight = Number.parseFloat(weight)
    // '모름'이거나 생년 미선택이면 생년/생월 둘 다 없음. 생월은 생년이 있어야만 의미가 있다.
    const savedYear = unknownBirth || !birthYear ? undefined : Number(birthYear)
    const savedMonth = savedYear == null || !birthMonth ? undefined : Number(birthMonth)
    const input: PetInput = {
      name: name.trim(),
      species,
      breed: breed || undefined,
      birthYear: savedYear,
      birthMonth: savedMonth,
      weightKg: Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : undefined,
      photoUrl: photos[0],
    }
    savePet.mutate({ id: target?.id, input }, { onSuccess: onSaved })
  }

  return (
    <MobileScreen
      header={<BackAppBar onBack={onCancel} title={target ? '펫 프로필 수정' : '펫 프로필 작성'} />}
      footer={
        <BottomFixedAction
          primary={{
            label: '저장',
            onClick: handleSave,
            disabled: !canSave,
            loading: savePet.isPending,
          }}
        />
      }
    >
      <div className="flex flex-col gap-5 p-4">
        {/* 펫 사진 */}
        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-text-secondary">펫 사진</span>
          <PhotoUpload
            photos={photos}
            onAdd={handleAddPhoto}
            onRemove={() => setPhotos([])}
            max={1}
          />
        </div>

        {/* 종 */}
        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-text-secondary">종</span>
          <SegmentedControl options={SPECIES_OPTIONS} value={species} onChange={handleSpeciesChange} />
        </div>

        {/* 이름 */}
        <Input
          label="이름"
          placeholder="반려동물 이름"
          value={name}
          onChange={e => setName(e.target.value)}
        />

        {/* 품종 */}
        <Select
          label="품종"
          placeholder="품종을 선택해 주세요"
          options={breedOptions(species)}
          value={breed}
          onChange={setBreed}
        />

        {/* 생년월 */}
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-3">
            {/* 생년 */}
            <div className="flex-1">
              <Select
                label="생년"
                placeholder="선택"
                options={BIRTH_YEAR_OPTIONS}
                value={unknownBirth ? '' : birthYear}
                onChange={setBirthYear}
                disabled={unknownBirth}
              />
            </div>
            {/* 생월 — 생년이 있어야 의미가 있어 미선택/모름이면 비활성 */}
            <div className="flex-1">
              <Select
                label="생월"
                placeholder="선택"
                options={BIRTH_MONTH_OPTIONS}
                value={unknownBirth || !birthYear ? '' : birthMonth}
                onChange={setBirthMonth}
                disabled={unknownBirth || !birthYear}
              />
            </div>
          </div>
          <Checkbox checked={unknownBirth} onChange={setUnknownBirth} label="생년월을 몰라요" />
        </div>

        {/* 체중 */}
        <Input
          label="체중"
          placeholder="0.0"
          inputMode="decimal"
          rightAddon="kg"
          value={weight}
          onChange={e => setWeight(e.target.value)}
        />
      </div>
    </MobileScreen>
  )
}
