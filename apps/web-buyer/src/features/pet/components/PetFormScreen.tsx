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
  isWithinPhotoSizeLimit,
  OVERSIZED_PHOTO_MESSAGE,
  PET_NAME_MAX_LENGTH,
  PET_NAME_REQUIRED_MESSAGE,
  PET_WEIGHT_MAX_KG,
  PET_WEIGHT_MIN_KG,
  PET_WEIGHT_RANGE_MESSAGE,
  PET_WEIGHT_STEP_KG,
  PET_WEIGHT_STEP_MESSAGE,
  petErrorMessage,
  petPhotoUploadErrorMessage,
  uploadPetPhoto,
  useRegisterPet,
  useUpdatePet,
  type PetInput,
} from '@/shared/pet'
import { useBreedOptions } from '../pet.queries'
import { BIRTH_MONTH_OPTIONS, BIRTH_YEAR_OPTIONS, SPECIES_OPTIONS } from '../pet.mock'

/** 서버에서 받은 표시용 URL은 놓아주면 안 되고, 로컬 미리보기 blob만 해제한다. */
function revokeIfBlob(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
}

/** 체중 칸의 브라우저 판정(min/max/step)을 안내 문구로 바꾼다. 범위와 자릿수는 속성에만 두고 여기서 다시 계산하지 않는다. */
function weightValidityMessage(validity: ValidityState): string | null {
  if (validity.valid) return null
  // 숫자로 읽히지 않는 입력(5e, -, 4.. 등)은 값이 비고 badInput만 켜진다. 범위 문구를 띄우면 엉뚱한 안내가 된다.
  if (validity.badInput) return '체중은 숫자로 입력해주세요'
  return validity.stepMismatch ? PET_WEIGHT_STEP_MESSAGE : PET_WEIGHT_RANGE_MESSAGE
}

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
// 이름 공백은 trim으로, 이름 길이와 체중 범위/자릿수는 네이티브 속성(maxLength/min/max/step)이 판정해 필드 아래에
// 안내하고 저장을 막는다. 그래도 서버가 거절하면(400 → petErrorMessage) 그 errorCode 문구를 인라인으로 보여준다.
export function PetFormScreen({ target, onCancel, onSaved }: PetFormScreenProps) {
  const registerPet = useRegisterPet()
  const updatePet = useUpdatePet()
  const isPending = registerPet.isPending || updatePet.isPending
  const [saveError, setSaveError] = useState<string | null>(null)

  const [species, setSpecies] = useState<PetSpecies>(target?.species ?? 'cat')
  const [name, setName] = useState(target?.name ?? '')
  const [nameTouched, setNameTouched] = useState(false)
  // 품종은 option value(String(breedId))로 다룬다. ''=미선택(아래 프리필 파생에 위임).
  const [breedSel, setBreedSel] = useState('')
  const [birthYear, setBirthYear] = useState(target?.birthYear != null ? String(target.birthYear) : '')
  const [birthMonth, setBirthMonth] = useState(target?.birthMonth != null ? String(target.birthMonth) : '')
  // 생년월 '모름'. 켜면 생년/생월을 비활성·비우고 둘 다 undefined로 저장한다. 편집 시 birthYear가
  // 없던 펫(=모름으로 저장된 펫)이면 켠 상태로 프리필한다.
  const [unknownBirth, setUnknownBirth] = useState(target != null && target.birthYear == null)
  const [weight, setWeight] = useState(target?.weightKg != null ? String(target.weightKg) : '')
  // 체중 칸의 마지막 브라우저 판정 문구. 입력할 때마다 바로 갱신한다(체중은 선택 항목이라 비어 있으면 정상).
  const [weightError, setWeightError] = useState<string | null>(null)
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
    // presigned PUT은 S3 직행이라 서버가 크기를 못 막는다 — 발급 전에 여기서 걸러 안내한다(형식은 서버 몫).
    if (!isWithinPhotoSizeLimit(file)) {
      setSaveError(OVERSIZED_PHOTO_MESSAGE)
      return
    }
    setSaveError(null)
    // 이전 미리보기 blob은 여기서 놓아준다. 안 하면 사진을 바꿀 때마다 누수된다.
    setPhotos(prev => {
      prev.forEach(revokeIfBlob)
      return [URL.createObjectURL(file)]
    })
    setIsUploading(true)
    uploadPetPhoto(file)
      .then(key => setUploadedKey(key))
      .catch((e: unknown) => {
        // 업로드가 실패했으면 미리보기를 걷어낸다. 올라간 것처럼 보이면 저장 후에야 사라진다.
        setPhotos(prev => {
          prev.forEach(revokeIfBlob)
          return []
        })
        setUploadedKey(null)
        setSaveError(petPhotoUploadErrorMessage(e))
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

  const nameBlank = name.trim() === ''
  // 이름 안내는 한 번 벗어난 뒤에만 띄운다(손대지 않은 폼에 오류가 뜨지 않게).
  const nameError = nameTouched && nameBlank ? PET_NAME_REQUIRED_MESSAGE : undefined

  // 품종은 요청 타입(breedId: Long) 자체가 필수다. 빠지면 서버가 본문 파싱 단계에서 필드 안내 없는 400만
  // 주므로 고르기 전에는 저장을 잠근다. 업로드 중 저장도 막는다. 미리보기는 이미 떠 있는데 tmp 키가
  // 아직 없어서, 그대로 보내면 사진 없는 펫이 저장되고 사용자는 붙은 줄 안다.
  const canSave = !nameBlank && resolvedBreedId != null && weightError == null && !isUploading

  const handleSave = () => {
    if (resolvedBreedId == null || !canSave) return
    // '모름'이거나 생년 미선택이면 생년/생월 둘 다 없음. 생월은 생년이 있어야만 의미가 있다.
    const savedYear = unknownBirth || !birthYear ? undefined : Number(birthYear)
    const savedMonth = savedYear == null || !birthMonth ? undefined : Number(birthMonth)
    const input: PetInput = {
      // 이름 앞뒤 공백은 BE(@NotBlankUnicode)가 정규화하지 않아 그대로 저장된다.
      name: name.trim(),
      species,
      breed: selectedOption?.label ?? (keepPrevBreed ? target.breed : undefined),
      breedId: resolvedBreedId,
      birthYear: savedYear,
      birthMonth: savedMonth,
      weightKg: weight === '' ? undefined : Number.parseFloat(weight),
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
        {/* DS Input은 aria를 달지 않아 직접 넘긴다. helper(<id>-helper)는 오류가 있을 때만 렌더된다. */}
        <Input
          id="pet-name"
          label="이름"
          placeholder="반려동물 이름"
          maxLength={PET_NAME_MAX_LENGTH}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => setNameTouched(true)}
          state={nameError ? 'error' : 'default'}
          helperText={nameError}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'pet-name-helper' : undefined}
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

        {/* 체중. type=number라 숫자가 아닌 입력은 값이 비어 NaN이 서버로 새지 않는다. 범위와 자릿수는 min/max/step이 판정한다.
            판정은 onChange가 아니라 onInput에서 읽는다. badInput이면 값이 ''로 남아 React onChange가 발화하지 않아서,
            onChange에서만 읽으면 안내가 안 뜨거나(빈 칸에 e 입력) 지운 뒤에도 안내와 잠금이 남는다(5e 입력 후 전부 삭제). */}
        <Input
          id="pet-weight"
          label="체중"
          placeholder="0.0"
          type="number"
          inputMode="decimal"
          min={PET_WEIGHT_MIN_KG}
          max={PET_WEIGHT_MAX_KG}
          step={PET_WEIGHT_STEP_KG}
          rightAddon="kg"
          value={weight}
          onChange={e => setWeight(e.target.value)}
          onInput={e => setWeightError(weightValidityMessage(e.currentTarget.validity))}
          state={weightError != null ? 'error' : 'default'}
          helperText={weightError ?? undefined}
          aria-invalid={weightError != null || undefined}
          aria-describedby={weightError != null ? 'pet-weight-helper' : undefined}
        />
      </div>
    </MobileScreen>
  )
}
