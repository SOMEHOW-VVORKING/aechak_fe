import type { PetProfile, PetSpecies } from '@aechak/domain'
import type { SegmentedControlOption, SelectOption } from '@aechak/design-system/web'

// 펫 프로필(b10-st-3 관리 / b10-st-8 작성) 공용 상수·파생 로직. 실제 펫 데이터는 shared/pet
// 스토어가 단일 소스이고, 여기서는 라벨/옵션/표기 파생만 다룬다.

// 오늘 연도/월(세션 고정값 — new Date() 미사용). 나이 파생에 쓴다.
const CURRENT_YEAR = 2026
const CURRENT_MONTH = 7

export const SPECIES_LABEL: Record<PetSpecies, string> = {
  dog: '강아지',
  cat: '고양이',
}

// 종 선택(목업 세그먼트대로 강아지/고양이 2종 — SegmentedControl로 구현.
// 라우트 리맵 리포의 'Radio' 표기 대신 실제 목업 마크업(segmented)을 따랐다).
export const SPECIES_OPTIONS: SegmentedControlOption[] = [
  { value: 'dog', label: '강아지' },
  { value: 'cat', label: '고양이' },
]

// 품종 옵션은 하드코딩하지 않는다 — 서버 breeds API(pet.queries.ts의 useBreedOptions)가 단일 원본.

// 생년 선택(현재 연도부터 20년 전까지, 최신순).
export const BIRTH_YEAR_OPTIONS: SelectOption[] = Array.from({ length: 21 }, (_, i) => {
  const year = CURRENT_YEAR - i
  return { value: String(year), label: `${year}년` }
})

// 생월 선택(1월~12월). 생년을 고른 경우에만 의미가 있다.
export const BIRTH_MONTH_OPTIONS: SelectOption[] = Array.from({ length: 12 }, (_, i) => {
  const month = i + 1
  return { value: String(month), label: `${month}월` }
})

// 생년(+생월) → 나이(만 나이 근사). 생년이 없으면 undefined('모름'). 생월이 있으면 올해 생일이
// 아직 안 지난 경우 한 살 어리게 계산한다.
export function petAge(
  birthYear: number | undefined,
  birthMonth?: number,
): number | undefined {
  if (birthYear == null) return undefined
  const notYetThisYear = birthMonth != null && CURRENT_MONTH < birthMonth ? 1 : 0
  return Math.max(0, CURRENT_YEAR - birthYear - notYetThisYear)
}

// 펫 카드 보조 텍스트 — "고양이 / 코리안 숏헤어 / 3살 / 4.2kg"(카피 컨벤션에 따라 구분자는 '/').
// 값이 없는 항목은 건너뛴다.
export function formatPetMeta(pet: PetProfile): string {
  const parts: string[] = [SPECIES_LABEL[pet.species]]
  if (pet.breed) parts.push(pet.breed)
  const age = petAge(pet.birthYear, pet.birthMonth)
  if (age != null) parts.push(`${age}살`)
  if (pet.weightKg != null) parts.push(`${pet.weightKg}kg`)
  return parts.join(' / ')
}
