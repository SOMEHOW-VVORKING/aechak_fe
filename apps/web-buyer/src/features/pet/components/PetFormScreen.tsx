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
import { useBreedOptions, useSavePet } from '../pet.queries'
import { BIRTH_MONTH_OPTIONS, BIRTH_YEAR_OPTIONS, SPECIES_OPTIONS } from '../pet.mock'

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
  // 품종은 option value(String(breedId))로 다룬다. ''=미선택(아래 프리필 파생에 위임).
  const [breedSel, setBreedSel] = useState('')
  const [birthYear, setBirthYear] = useState(target?.birthYear != null ? String(target.birthYear) : '')
  const [birthMonth, setBirthMonth] = useState(target?.birthMonth != null ? String(target.birthMonth) : '')
  // 생년월 '모름' — 켜면 생년/생월을 비활성·비우고 둘 다 undefined로 저장한다. 편집 시 birthYear가
  // 없던 펫(=모름으로 저장된 펫)이면 켠 상태로 프리필한다.
  const [unknownBirth, setUnknownBirth] = useState(target != null && target.birthYear == null)
  const [weight, setWeight] = useState(target?.weightKg != null ? String(target.weightKg) : '')
  const [photos, setPhotos] = useState<string[]>(target?.photoUrl ? [target.photoUrl] : [])

  // 종별 품종 목록(서버 breeds API). 종 전환 시 새 종의 목록으로 갈아끼워진다.
  const breedsQuery = useBreedOptions(species)
  const breedOpts = breedsQuery.data

  // 파생 선택값 — 생월 Select가 표시값을 파생하는 기존 패턴과 동일(effect 없음, StrictMode 안전).
  // 우선순위: (1) 현재 옵션에 존재하는 사용자 선택 (2) target 프리필(같은 종일 때, breedId 우선 →
  // 라벨 매칭: API 연동 전 라벨만 저장된 펫도 편집 시 자동 해석·백필) (3) 미선택.
  const prefillSel = (() => {
    if (!breedOpts || !target || target.species !== species) return ''
    if (target.breedId != null && breedOpts.some(o => o.value === String(target.breedId))) {
      return String(target.breedId)
    }
    return breedOpts.find(o => o.label === target.breed)?.value ?? ''
  })()
  const selectedBreed = breedOpts?.some(o => o.value === breedSel) ? breedSel : prefillSel

  // 종이 바뀌면 새 종에 없는 품종 선택은 위 파생이 초기화하므로 종만 갱신한다.
  const handleSpeciesChange = (value: string) => setSpecies(value as PetSpecies)

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
    const selectedOption = breedOpts?.find(o => o.value === selectedBreed)
    // 선택이 없으면 종이 그대로일 때만 기존 품종을 보존한다(품종 API 장애 중에도 다른 필드 수정이
    // 품종을 지우지 않게). 종이 바뀌었으면 교차 종 stale breedId('기타'는 종마다 id가 다름)를
    // 남기지 않도록 둘 다 비운다.
    const keepPrevBreed = target != null && target.species === species
    const input: PetInput = {
      name: name.trim(),
      species,
      breed: selectedOption?.label ?? (keepPrevBreed ? target.breed : undefined),
      breedId:
        selectedOption != null
          ? Number(selectedOption.value)
          : keepPrevBreed
            ? target.breedId
            : undefined,
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

        {/* 품종 — 서버 breeds API 목록. 인증 실패(401)는 전역에서 로그인으로 튕기므로(main.tsx의
            setOnAuthExpired) 여기 인라인 에러는 네트워크·서버 오류 같은 비인증 실패에만 뜬다.
            폴백 목록도 재시도 버튼도 없다 — 화면 재진입 시 자연히 다시 조회된다. */}
        <Select
          label="품종"
          placeholder={breedsQuery.isPending ? '품종을 불러오는 중이에요' : '품종을 선택해 주세요'}
          options={breedOpts ?? []}
          value={selectedBreed}
          onChange={setBreedSel}
          disabled={breedsQuery.isPending || breedsQuery.isError}
          error={breedsQuery.isError ? '품종 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' : undefined}
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
