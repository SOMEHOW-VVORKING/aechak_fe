import { useQuery } from '@tanstack/react-query'
import { getBreeds } from '@aechak/api'
import type { BreedListResponse, Species } from '@aechak/api'
import type { SelectOption } from '@aechak/design-system/web'
import type { PetSpecies } from '@aechak/domain'

// 펫 데이터 자체는 shared/pet(react-query + 서버)이 단일 소스다. 이 파일에는 펫 폼에서만 쓰는
// 품종 옵션 조회만 남긴다. 목록·등록·수정·삭제·대표지정은 shared/pet에서 가져다 쓴다.

const SPECIES_API: Record<PetSpecies, Species> = { dog: 'DOG', cat: 'CAT' }

/** breeds 응답 → Select 옵션(value=String(breedId), label 그대로). 서버가 이미 가나다순+sentinel 후순 정렬. */
export function toBreedOptions(res: BreedListResponse): SelectOption[] {
  return res.data.map(b => ({ value: String(b.breedId), label: b.label }))
}

// 생성된 useGetBreeds 훅 대신 fetcher만 소비한다. packages/api와 앱의 react-query 선언 범위가
// 달라 훅/옵션 타입이 패키지 경계를 넘으면 버전 표류 시 깨질 수 있다. fetcher는 순수 Promise라 안전.
export function useBreedOptions(species: PetSpecies) {
  return useQuery({
    queryKey: ['breeds', species],
    queryFn: ({ signal }) => getBreeds({ species: SPECIES_API[species] }, signal),
    select: toBreedOptions,
    staleTime: Infinity, // 품종 목록은 세션 내 불변. 종 전환 왕복에 재요청 없음
  })
}
