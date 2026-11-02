import { errorResponse } from '@aechak/api'
import type { StoreData, StoreSettingsUpdateRequest } from '@aechak/api'

// 스토어 설정(승인 뒤 화면) 와이어 ↔ 폼 변환 한 곳. 입점 신청 쪽(store-settings.contract)과
// 파일을 나눈 이유: 같은 화면이지만 다른 엔드포인트(GET·PUT /sellers/me/store)이고 서버 필드
// 집합이 전혀 겹치지 않는다.
//
// 폼이 와이어와 다른 점은 둘뿐이다.
// 1. null을 입력 컨트롤이 다룰 수 없어 ''로 평평하게 만든다(저장 시 되돌린다).
// 2. 이미지 키는 폼에 노출하지 않고 그대로 들고 간다 — 저장이 전체 덮어쓰기라 키를 빼고 보내면
//    서버가 이미지를 제거한다. 업로드 UI는 이 범위에 없으므로 "읽은 키를 되돌려주기"만 한다.

export interface StoreProfileFormValue {
  storeName: string
  brandIntro: string
  zipCode: string
  roadAddress: string
  detailAddress: string
  /** 폼에 보이지 않는 보존 값 — 저장이 전체 덮어쓰기라 빼면 이미지가 지워진다. */
  profileImageKey: string | null
  bannerImageKey: string | null
}

export const MAX_STORE_NAME_LENGTH = 100
export const MAX_BRAND_INTRO_LENGTH = 1000

const text = (value: string | null | undefined): string => value ?? ''

/** 빈 문자열은 서버에 null로 보낸다 — ''로 보내면 "비웠다"가 아니라 빈 문자열이 저장된다. */
const orNull = (value: string): string | null => {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function formValueFrom(store: StoreData): StoreProfileFormValue {
  return {
    storeName: store.storeName,
    brandIntro: text(store.brandIntro),
    zipCode: text(store.zipCode),
    roadAddress: text(store.roadAddress),
    detailAddress: text(store.detailAddress),
    profileImageKey: store.profileImageKey ?? null,
    bannerImageKey: store.bannerImageKey ?? null,
  }
}

export function toUpdateRequest(form: StoreProfileFormValue): StoreSettingsUpdateRequest {
  return {
    storeName: form.storeName.trim(),
    brandIntro: orNull(form.brandIntro),
    profileImageKey: form.profileImageKey,
    bannerImageKey: form.bannerImageKey,
    zipCode: orNull(form.zipCode),
    roadAddress: orNull(form.roadAddress),
    detailAddress: orNull(form.detailAddress),
  }
}

/** 보낸 본문을 읽은 스토어에 덮어쓴 결과. PUT이 204라 이것이 저장 직후의 화면 값이다. */
export function appliedStore(store: StoreData, request: StoreSettingsUpdateRequest): StoreData {
  return {
    ...store,
    storeName: request.storeName.trim(),
    brandIntro: request.brandIntro ?? null,
    profileImageKey: request.profileImageKey ?? null,
    bannerImageKey: request.bannerImageKey ?? null,
    zipCode: request.zipCode ?? null,
    roadAddress: request.roadAddress ?? null,
    detailAddress: request.detailAddress ?? null,
  }
}

/** 눌러 보고 나서야 400(10006)을 받는 자기모순 하나만 미리 막는다. */
export function storeNameError(form: StoreProfileFormValue): string | null {
  const trimmed = form.storeName.trim()
  if (trimmed.length === 0) return '상호(스토어명)를 입력해 주세요.'
  if (trimmed.length > MAX_STORE_NAME_LENGTH) {
    return `상호(스토어명)는 ${MAX_STORE_NAME_LENGTH}자 이하여야 해요.`
  }
  return null
}

export function storeSettingsErrorMessage(error: unknown): string {
  switch (errorResponse(error)?.data?.errorCode) {
    // 90001은 본문 검증(빈 상호·길이 초과) 전부를 묶는다. 상호는 화면 가드가 먼저 막으므로
    // 여기 도달하는 건 대개 길이이고, 10006은 공백 문자만 든 상호다 — 둘 다 어느 칸인지 말한다.
    case 90001:
      return '입력한 내용을 다시 확인해 주세요. 상호와 소개, 주소 길이를 확인해 주세요.'
    case 10006:
      return '상호(스토어명)에 공백만 들어 있어요. 보이는 글자를 넣어 주세요.'
    case 10002:
      return '운영 중인 스토어만 설정을 바꿀 수 있어요.'
    case 10004:
      return '아직 셀러로 등록되지 않은 계정이에요. 입점 승인 뒤에 바꿀 수 있어요.'
    case 10000:
      return '셀러 정보를 찾을 수 없어요. 화면을 새로고침해 주세요.'
    default:
      return '저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}
