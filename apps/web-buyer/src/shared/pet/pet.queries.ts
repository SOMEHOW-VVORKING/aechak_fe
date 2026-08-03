import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deletePet,
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

const PET_LIMIT_EXCEEDED = 30130

const PETS_QUERY_KEY = ['pets'] as const

// 폼이 수집하는 값. 목업 스토어 시절 PetInput 모양을 유지해 화면 코드를 안 고친다.
export interface PetInput {
  name: string
  species: PetSpecies
  breed?: string
  breedId?: number
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
    // 품종은 필수 계약이다. 미선택 상태로 저장 버튼이 눌리는 건 폼이 막아야 한다.
    breedId: input.breedId as number,
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
  const pets = (query.data?.data?.pets ?? []).map(toPetProfile)
  return {
    pets,
    isLoading: query.isLoading,
    // 캐시에 목록이 남아 있으면 배경 refetch 실패로 화면을 에러로 갈아끼우지 않는다.
    isError: query.isError && pets.length === 0,
    refetch: query.refetch,
  }
}

// 에러 문구는 HTTP status로 고르고, 같은 status에 여러 사유가 있으면 errorCode까지 본다.
// axios 타입을 안 끌어오려고 duck-typing.
export function petErrorMessage(error: unknown): string {
  const status = (error as { response?: { status?: number } })?.response?.status
  const data = (error as { response?: { data?: { message?: string; errorCode?: number } } })?.response
    ?.data
  const serverMessage = data?.message
  switch (status) {
    // 422는 개수 초과 전용이 아니다. 코드까지 봐야 다른 검증 실패를 오안내하지 않는다.
    case 422:
      return data?.errorCode === PET_LIMIT_EXCEEDED
        ? `반려동물은 최대 ${MAX_PETS}마리까지 등록할 수 있어요`
        : (serverMessage ?? '입력한 정보를 다시 확인해주세요')
    case 409:
      return '다른 곳에서 먼저 수정했어요. 새로고침 후 다시 시도해주세요'
    case 404:
      return '이미 삭제된 반려동물이에요'
    case 403:
      return serverMessage ?? '접근 권한이 없어요'
    case 400:
      return serverMessage ?? '입력한 정보를 다시 확인해주세요'
    default:
      return serverMessage ?? '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요'
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
  return () => queryClient.invalidateQueries({ queryKey: PETS_QUERY_KEY })
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
          const promoted = res?.data?.promotedDefaultPetId
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
