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
import {
  isSupportedPetPhoto,
  isWithinPhotoSizeLimit,
  OVERSIZED_PHOTO_MESSAGE,
  petErrorMessage,
  UNSUPPORTED_PHOTO_MESSAGE,
  uploadPetPhoto,
  useRegisterPet,
  useUpdatePet,
  type PetInput,
} from '@/shared/pet'

/** 서버에서 받은 표시용 URL은 놓아주면 안 되고, 로컬 미리보기 blob만 해제한다. */
function revokeIfBlob(url: string) {
  if (url.startsWith('blob:') && typeof URL?.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}
import { useBreedOptions } from '../pet.queries'
import { BIRTH_MONTH_OPTIONS, BIRTH_YEAR_OPTIONS, SPECIES_OPTIONS } from '../pet.mock'

// 서버가 받는 체중 범위. 벗어난 값을 조용히 버리지 않고 인라인으로 알린다.
const MIN_WEIGHT_KG = 0.1
const MAX_WEIGHT_KG = 100

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
  const registerPet = useRegisterPet()
  const updatePet = useUpdatePet()
  const isPending = registerPet.isPending || updatePet.isPending
  const [saveError, setSaveError] = useState<string | null>(null)

  const [species, setSpecies] = useState<PetSpecies>(target?.species ?? 'cat')
  const [name, setName] = useState(target?.name ?? '')
  // 품종은 option value(String(breedId))로 다룬다. ''=미선택(아래 프리필 파생에 위임).
  const [breedSel, setBreedSel] = useState('')
  const [birthYear, setBirthYear] = useState(target?.birthYear != null ? String(target.birthYear) : '')
  const [birthMonth, setBirthMonth] = useState(target?.birthMonth != null ? String(target.birthMonth) : '')
  // 생년월 '모름'. 켜면 생년/생월을 비활성·비우고 둘 다 undefined로 저장한다. 편집 시 birthYear가
  // 없던 펫(=모름으로 저장된 펫)이면 켠 상태로 프리필한다.
  const [unknownBirth, setUnknownBirth] = useState(target != null && target.birthYear == null)
  const [weight, setWeight] = useState(target?.weightKg != null ? String(target.weightKg) : '')
  const [photos, setPhotos] = useState<string[]>(target?.photoUrl ? [target.photoUrl] : [])
  // 업로드로 새로 받은 tmp 키. null이면 기존 키(target.profileImageKey)를 그대로 쓴다.
  const [uploadedKey, setUploadedKey] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  // 종별 품종 목록(서버 breeds API). 종 전환 시 새 종의 목록으로 갈아끼워진다.
  const breedsQuery = useBreedOptions(species)
  const breedOpts = breedsQuery.data

  // 파생 선택값. 생월 Select가 표시값을 파생하는 기존 패턴과 동일(effect 없음, StrictMode 안전).
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

  // 미리보기는 로컬 blob으로 즉시 띄우고, 실제 파일은 presigned URL로 올려 tmp 키를 받아둔다.
  // 저장 시 그 키를 보내야 새로고침 후에도 사진이 남는다.
  const handleAddPhoto = (files: File[]) => {
    const file = files[0]
    if (!file) return
    if (!isSupportedPetPhoto(file)) {
      setSaveError(UNSUPPORTED_PHOTO_MESSAGE)
      return
    }
    if (!isWithinPhotoSizeLimit(file)) {
      setSaveError(OVERSIZED_PHOTO_MESSAGE)
      return
    }
    setSaveError(null)
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      // 이전 미리보기 blob은 여기서 놓아준다. 안 하면 사진을 바꿀 때마다 누수된다.
      setPhotos(prev => {
        prev.forEach(revokeIfBlob)
        return [URL.createObjectURL(file)]
      })
    }
    setIsUploading(true)
    uploadPetPhoto(file)
      .then(key => setUploadedKey(key))
      .catch(() => {
        // 업로드가 실패했으면 미리보기를 걷어낸다. 올라간 것처럼 보이면 저장 후에야 사라진다.
        setPhotos(prev => {
          prev.forEach(revokeIfBlob)
          return []
        })
        setUploadedKey(null)
        setSaveError('사진을 올리지 못했어요. 잠시 후 다시 시도해주세요')
      })
      .finally(() => setIsUploading(false))
  }

  const handleRemovePhoto = () => {
    setPhotos(prev => {
      prev.forEach(revokeIfBlob)
      return []
    })
    setUploadedKey(null)
  }

  // 선택이 없으면 종이 그대로일 때만 기존 품종을 보존한다(품종 API 장애 중에도 다른 필드 수정이
  // 품종을 지우지 않게). 종이 바뀌었으면 교차 종 stale breedId('기타'는 종마다 id가 다름)를
  // 남기지 않도록 둘 다 비운다.
  const keepPrevBreed = target != null && target.species === species
  const selectedOption = breedOpts?.find(o => o.value === selectedBreed)
  const resolvedBreedId =
    selectedOption != null ? Number(selectedOption.value) : keepPrevBreed ? target.breedId : undefined

  const parsedWeight = Number.parseFloat(weight)
  // 입력이 있는데 범위를 벗어난 경우만 에러다. 빈 값은 '체중 미입력'이라 정상이다.
  const weightError =
    weight.trim() !== '' &&
    (!Number.isFinite(parsedWeight) || parsedWeight < MIN_WEIGHT_KG || parsedWeight > MAX_WEIGHT_KG)
      ? `체중은 ${MIN_WEIGHT_KG}~${MAX_WEIGHT_KG}kg 사이로 입력해주세요`
      : null

  // 품종은 서버 필수 계약이다. 빼면 400이 나므로 저장 버튼에서 막는다.
  // 업로드 중 저장도 막는다. 미리보기는 이미 떠 있는데 tmp 키가 아직 없어서,
  // 그대로 보내면 사진 없는 펫이 저장되고 사용자는 붙은 줄 안다.
  const canSave = name.trim() !== '' && resolvedBreedId != null && weightError == null && !isUploading

  const handleSave = () => {
    if (!canSave) return
    // '모름'이거나 생년 미선택이면 생년/생월 둘 다 없음. 생월은 생년이 있어야만 의미가 있다.
    const savedYear = unknownBirth || !birthYear ? undefined : Number(birthYear)
    const savedMonth = savedYear == null || !birthMonth ? undefined : Number(birthMonth)
    const input: PetInput = {
      name: name.trim(),
      species,
      breed: selectedOption?.label ?? (keepPrevBreed ? target.breed : undefined),
      breedId: resolvedBreedId,
      birthYear: savedYear,
      birthMonth: savedMonth,
      weightKg: weight.trim() === '' ? undefined : parsedWeight,
      // 수정은 전체 객체 전송이라 기존 키를 실어 보내지 않으면 서버가 사진을 지운다.
      // 새로 올렸으면 그 tmp 키, 안 올렸으면 기존 키, 사진을 뺐으면 undefined.
      profileImageKey: photos.length === 0 ? undefined : (uploadedKey ?? target?.profileImageKey),
      version: target?.version,
    }
    const opts = {
      onSuccess: onSaved,
      onError: (e: unknown) => setSaveError(petErrorMessage(e)),
    }
    if (target != null) updatePet.mutate(target.id, input, opts)
    else registerPet.mutate(input, opts)
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
            loading: isPending,
          }}
        />
      }
    >
      <div className="flex flex-col gap-5 p-4">
        {saveError != null && (
          <p role="alert" className="text-body-sm text-error-fg">
            {saveError}
          </p>
        )}

        {/* 펫 사진 */}
        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-text-secondary">펫 사진</span>
          <PhotoUpload photos={photos} onAdd={handleAddPhoto} onRemove={handleRemovePhoto} max={1} />
          {isUploading && <span className="text-caption text-text-tertiary">사진 올리는 중…</span>}
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

        {/* 품종. 서버 breeds API 목록. 인증 실패(401)는 전역에서 로그인으로 튕기므로(main.tsx의
            setOnAuthExpired) 여기 인라인 에러는 네트워크·서버 오류 같은 비인증 실패에만 뜬다.
            폴백 목록도 재시도 버튼도 없다. 화면 재진입 시 자연히 다시 조회된다. */}
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
            {/* 생월. 생년이 있어야 의미가 있어 미선택/모름이면 비활성 */}
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
          state={weightError != null ? 'error' : 'default'}
          helperText={weightError ?? undefined}
        />
      </div>
    </MobileScreen>
  )
}
