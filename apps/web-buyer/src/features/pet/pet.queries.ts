import { useMutation } from '@tanstack/react-query'
import type { PetProfile } from '@aechak/domain'
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
