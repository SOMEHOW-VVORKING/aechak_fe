import { useMutation, useQuery } from '@tanstack/react-query'
import { getBreeds } from '@aechak/api'
import type { BreedListResponse, Species } from '@aechak/api'
import type { SelectOption } from '@aechak/design-system/web'
import type { PetProfile, PetSpecies } from '@aechak/domain'
import { addPet, updatePet, usePets, type PetInput } from '@/shared/pet'

// 펫 데이터는 shared/pet 스토어(useSyncExternalStore)가 단일 소스다 — 추가/수정/삭제/대표 지정이
// 즉시 반영돼야 하는 클라이언트 상태라 셀렉터 훅으로 읽는다. 저장(추가/수정)만 useMutation으로
// 감싸 폼 저장 버튼의 로딩 상태를 준다. 삭제/대표 지정은 즉시 반영이라 스토어 함수를 직접 호출한다.

/** 전체 펫 목록(스토어 구독). */
export function usePetList(): readonly PetProfile[] {
  return usePets()
}

interface SavePetVars {
  /** 있으면 수정, 없으면 추가. */
  id?: string
  input: PetInput
}

// 도메인 종('dog'|'cat') → 서버 enum('DOG'|'CAT') 매핑. 서버 계약은 이 파일 밖으로 새지 않는다.
const SPECIES_API: Record<PetSpecies, Species> = { dog: 'DOG', cat: 'CAT' }

/** breeds 응답 → Select 옵션(value=String(breedId), label 그대로). 서버가 이미 가나다순+sentinel 후순 정렬. */
export function toBreedOptions(res: BreedListResponse): SelectOption[] {
  return res.data.map(b => ({ value: String(b.breedId), label: b.label }))
}

// 종별 품종 목록(서버 breeds API — 이 앱 최초의 실데이터 GET 연동). 생성된 useGetBreeds 훅 대신
// fetcher만 소비한다 — packages/api(^5.101)와 앱(^5.80)의 react-query 선언 범위가 달라 훅/옵션
// 타입이 패키지 경계를 넘으면 버전 표류 시 깨질 수 있다. fetcher는 순수 Promise라 안전.
export function useBreedOptions(species: PetSpecies) {
  return useQuery({
    queryKey: ['breeds', species],
    queryFn: ({ signal }) => getBreeds({ species: SPECIES_API[species] }, signal),
    select: toBreedOptions,
    staleTime: Infinity, // 품종 목록은 세션 내 불변 — 종 전환 왕복에 재요청 없음
  })
}

// 펫 저장(추가/수정) mutation. 저장 버튼 로딩(isPending)을 위해 감쌌고, 지연 후 스토어를 갱신하면
// 관리 목록이 즉시 반영된다.
export function useSavePet() {
  return useMutation<void, Error, SavePetVars>({
    mutationFn: ({ id, input }) =>
      new Promise(resolve => {
        setTimeout(() => {
          if (id) updatePet(id, input)
          else addPet(input)
          resolve()
        }, 400)
      }),
  })
}
