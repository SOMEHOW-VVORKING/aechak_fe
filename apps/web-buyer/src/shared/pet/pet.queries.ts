import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deletePet,
  errorResponse,
  getPets,
  registerPet,
  setDefaultPet,
  updatePet,
  type PetProfileResponse,
  type RegisterPetProfileRequest,
  type Species,
  type UpdatePetProfileRequest,
} from '@aechak/api'
import type { PetProfile, PetSpecies } from '@aechak/domain'

// 펫 프로필 화면(b10-st-3 관리 / b10-st-8 작성)을 실제 백엔드에 붙이는 얇은 어댑터.
// 대표 유일성·목록 정렬·첫 펫 자동 대표는 전부 서버 소유. 등록 성공 시 목록 invalidate로 다시 읽는다.
//
// 생성된 react-query 훅이 아니라 fetcher만 소비한다. packages/api와 앱의 react-query 선언 범위가
// 달라 훅/옵션 타입이 패키지 경계를 넘으면 버전 표류 시 깨진다. 이 파일이 자체 useQuery/useMutation으로 감싼다.

// 서버 한도와 같은 값
const MAX_PETS = 10

// 입력 제약은 BE 계약을 그대로 옮긴다(be origin/develop 기준). 폼은 이 값을 네이티브 속성(maxLength/min/max/step)으로
// 쓰고 판정은 브라우저 validity에 맡긴다. 경로는 be boot/api/.../user/pet/request/PetProfileConstraints.kt 와
// domain/.../user/pet/PetProfile.kt.
/** PetProfileConstraints.kt:9 NAME_MAX = PetProfile.kt:121 NAME_MAX */
export const PET_NAME_MAX_LENGTH = 50
/** PetProfileConstraints.kt:15 WEIGHT_MIN = PetProfile.kt:122 WEIGHT_MIN ("0.1") */
export const PET_WEIGHT_MIN_KG = 0.1
/** PetProfileConstraints.kt:16 WEIGHT_MAX = PetProfile.kt:123 WEIGHT_MAX ("200.0") */
export const PET_WEIGHT_MAX_KG = 200
/** PetProfileConstraints.kt:19 WEIGHT_FRACTION_DIGITS = 1 → 0.1kg 단위 */
export const PET_WEIGHT_STEP_KG = 0.1

// 화면 인라인 안내와 서버 도메인 코드 안내가 같은 문구를 쓴다.
export const PET_NAME_REQUIRED_MESSAGE = '이름을 입력해주세요'
export const PET_WEIGHT_RANGE_MESSAGE = `체중은 ${PET_WEIGHT_MIN_KG}~${PET_WEIGHT_MAX_KG}kg 사이로 입력해주세요`
export const PET_WEIGHT_STEP_MESSAGE = '체중은 소수점 첫째 자리까지 입력할 수 있어요'
const INVALID_INPUT_MESSAGE = '입력한 정보를 다시 확인해주세요'

// 서버 에러코드(BE UserErrorCode 펫 대역 + @Valid 실패 90001).
const PET_LIMIT_EXCEEDED = 30600
const INVALID_PET_WEIGHT = 30603
const INVALID_PET_BIRTH_YEAR_MONTH = 30604
const INVALID_BREED = 30700
const INVALID_REQUEST = 90001

const PETS_QUERY_KEY = ['pets'] as const

// 폼이 수집하는 값. 목업 스토어 시절 PetInput 모양을 유지해 화면 코드를 안 고친다.
export interface PetInput {
  name: string
  species: PetSpecies
  breed?: string
  /** 서버 필수 계약(RegisterPetProfileRequest.breedId: Long) — 폼이 선택을 확인한 뒤에만 호출한다. */
  breedId: number
  birthYear?: number
  birthMonth?: number
  weightKg?: number
  /** 새로 올린 tmp 키 또는 유지할 기존 키. 비우면 수정 시 사진이 지워진다. */
  profileImageKey?: string
  /** 수정 시 선점 감지용. 목록에서 받은 값을 그대로 되돌려 보낸다. */
  version?: number
}

const SPECIES_DOMAIN: Record<Species, PetSpecies> = { DOG: 'dog', CAT: 'cat' }

// 서버는 number id·YYYY-MM 문자열, 화면은 string id·연/월 분리. 변환은 이 두 매퍼에서만.
export function toPetProfile(res: PetProfileResponse): PetProfile {
  const [year, month] = (res.birthYearMonth ?? '').split('-')
  return {
    id: String(res.petId),
    name: res.name,
    species: SPECIES_DOMAIN[res.species],
    breed: res.breedLabel,
    breedId: res.breedId,
    birthYear: year ? Number(year) : undefined,
    birthMonth: month ? Number(month) : undefined,
    weightKg: res.weight ?? undefined,
    photoUrl: res.profileImageUrl ?? undefined,
    profileImageKey: res.profileImageKey ?? undefined,
    version: res.version,
    isDefault: res.isDefault,
  }
}

/** 수정은 전체 객체 전송이다. 유지할 값을 안 실으면 서버가 지운다. */
function toUpdatePetRequest(input: PetInput): UpdatePetProfileRequest {
  const base = toRegisterPetRequest(input)
  return {
    name: base.name,
    breedId: base.breedId,
    birthYearMonth: base.birthYearMonth,
    weight: base.weight,
    profileImageKey: base.profileImageKey,
    version: input.version,
  }
}

export function toRegisterPetRequest(input: PetInput): RegisterPetProfileRequest {
  return {
    name: input.name,
    breedId: input.breedId,
    // 생월을 모르면 연도만 보낸다. 서버가 1월로 맞춘다. 생년이 없으면 아예 안 보낸다.
    birthYearMonth:
      input.birthYear == null
        ? undefined
        : input.birthMonth == null
          ? String(input.birthYear)
          : `${input.birthYear}-${String(input.birthMonth).padStart(2, '0')}`,
    weight: input.weightKg,
    profileImageKey: input.profileImageKey,
  }
}

export function usePetList() {
  const query = useQuery({
    queryKey: PETS_QUERY_KEY,
    queryFn: ({ signal }) => getPets(signal),
  })
  const pets = (query.data?.data.pets ?? []).map(toPetProfile)
  return {
    pets,
    isLoading: query.isLoading,
    // 캐시에 목록이 남아 있으면 배경 refetch 실패로 화면을 에러로 갈아끼우지 않는다.
    isError: query.isError && pets.length === 0,
    refetch: query.refetch,
  }
}

// 에러 문구는 errorCode를 먼저 보고(같은 status에 사유가 여럿), 없으면 HTTP status로 고른다.
// 서버 message는 -습니다체이고 계약도 아니라 읽지 않는다. 90001은 화면 검증을 통과한 뒤에만 오므로 한 문장으로 안내한다.
export function petErrorMessage(error: unknown): string {
  const res = errorResponse(error)
  switch (res?.data?.errorCode) {
    case PET_LIMIT_EXCEEDED:
      return `반려동물은 최대 ${MAX_PETS}마리까지 등록할 수 있어요`
    case INVALID_PET_WEIGHT:
      return PET_WEIGHT_RANGE_MESSAGE
    case INVALID_PET_BIRTH_YEAR_MONTH:
      return '생년월은 이번 달보다 미래일 수 없어요'
    case INVALID_BREED:
      return '선택한 품종이 올바르지 않아요'
    case INVALID_REQUEST:
      return INVALID_INPUT_MESSAGE
  }
  switch (res?.status) {
    case 422:
    case 400:
      return INVALID_INPUT_MESSAGE
    case 409:
      return '다른 곳에서 먼저 수정했어요. 새로고침 후 다시 시도해주세요'
    case 404:
      return '이미 삭제된 반려동물이에요'
    case 403:
      return '접근 권한이 없어요'
    default:
      return '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요'
  }
}

interface MutateOptions {
  onSuccess?: () => void
  onError?: (error: unknown) => void
}

// mutation 성공 시 목록을 다시 읽는다. 대표 유일성·자동 승격·정렬이 전부 서버 소유라
// 클라이언트가 같은 규칙을 흉내내면 어긋난다.
function useInvalidatePets() {
  const queryClient = useQueryClient()
  // 반환해서 react-query가 refetch까지 기다리게 한다. isPending이 갱신 전 구간을 덮어
  // 목록이 아직 옛 상태인 동안 같은 버튼을 다시 누르는 걸 막는다.
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: PETS_QUERY_KEY }),
      // 상품 리뷰 AI 요약은 대표 펫 체급에 따라 달라진다(features/product useProductReviewSummary의 키).
      // 무효화만 하면 상품으로 돌아왔을 때 이전 체급 요약을 먼저 그리므로 아예 지운다.
      queryClient.removeQueries({ queryKey: ['review-summary'] }),
    ])
}

export function useRegisterPet() {
  const invalidate = useInvalidatePets()
  const mutation = useMutation({
    mutationFn: ({ input, isDefault }: { input: PetInput; isDefault?: boolean }) =>
      registerPet({ ...toRegisterPetRequest(input), isDefault }),
    onSuccess: invalidate,
  })
  return {
    isPending: mutation.isPending,
    mutate: (input: PetInput, opts?: MutateOptions & { isDefault?: boolean }) =>
      mutation.mutate({ input, isDefault: opts?.isDefault }, opts),
  }
}

export function useUpdatePet() {
  const invalidate = useInvalidatePets()
  const mutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: PetInput }) =>
      updatePet(Number(id), toUpdatePetRequest(input)),
    onSuccess: invalidate,
  })
  return {
    isPending: mutation.isPending,
    mutate: (id: string, input: PetInput, opts?: MutateOptions) => mutation.mutate({ id, input }, opts),
  }
}

/** 대표를 지우면 서버가 하나를 승격하고 그 id를 준다. 화면이 안내 문구를 띄울 수 있게 넘긴다. */
export function useRemovePet() {
  const invalidate = useInvalidatePets()
  const mutation = useMutation({
    mutationFn: (id: string) => deletePet(Number(id)),
    onSuccess: invalidate,
  })
  return {
    isPending: mutation.isPending,
    mutate: (
      id: string,
      opts?: { onSuccess?: (promotedDefaultId: string | null) => void; onError?: (e: unknown) => void },
    ) =>
      mutation.mutate(id, {
        onSuccess: res => {
          const promoted = res.data.promotedDefaultPetId
          opts?.onSuccess?.(promoted != null ? String(promoted) : null)
        },
        onError: opts?.onError,
      }),
  }
}

export function useSetDefaultPet() {
  const invalidate = useInvalidatePets()
  const mutation = useMutation({
    mutationFn: (id: string) => setDefaultPet(Number(id)),
    onSuccess: invalidate,
  })
  return {
    isPending: mutation.isPending,
    mutate: (id: string, opts?: MutateOptions) => mutation.mutate(id, opts),
  }
}
