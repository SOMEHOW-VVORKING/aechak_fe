import { useQuery } from '@tanstack/react-query'
import { getSellerCouriers, type CourierSummary } from '@aechak/api'

// 택배사 마스터(GET /sellers/couriers, seller 호스트)를 읽는 유일한 통로.
//
// shared에 둔 이유: 택배사를 고르는 화면이 배송 정책(features/shipping-policy)과 발송 처리
// (features/orders) 둘로 갈려 있고 feature → feature import는 경계 위반이다. 뒤에 올 회수 송장·
// 교환 재발송도 같은 목록을 쓴다.
//
// **코드는 서버 값을 그대로 쓴다.** `courierCode`는 courier_masters의 PK이고 시드가 대문자
// (CJ·LOTTE·HANJIN·LOGEN·POST)다. 소문자로 보내면 배송정책 저장·송장 등록·회수 송장·교환 재발송이
// 전부 404 errorCode 50303(COURIER_NOT_FOUND)이 된다 — 화면이 대소문자를 바꾸거나 목록을 하드코딩해서는
// 안 된다. 라벨도 서버 `courierName`을 쓴다(FE가 들고 있던 5종 라벨과 우연히 같았을 뿐이다).
//
// 정렬도 서버가 고정한다(courierName 오름차순 → courierCode 오름차순). 여기서 다시 정렬하지 않는다.

export type { CourierSummary } from '@aechak/api'

export const COURIERS_QUERY_KEY = ['couriers'] as const

/** 운영 중 바뀌지 않는 마스터라 세션 내 1회만 받는다(카테고리 트리와 같은 결). */
export const useCouriers = () =>
  useQuery({
    queryKey: COURIERS_QUERY_KEY,
    queryFn: ({ signal }) => getSellerCouriers(signal).then(response => response.data.items),
    staleTime: Infinity,
  })

/** DS Select 옵션 — value는 서버 코드, label은 서버 이름이다. */
export const courierSelectOptions = (couriers: CourierSummary[] | undefined) =>
  (couriers ?? []).map(courier => ({ value: courier.courierCode, label: courier.courierName }))

export const courierNameOf = (couriers: CourierSummary[] | undefined, courierCode: string): string =>
  (couriers ?? []).find(courier => courier.courierCode === courierCode)?.courierName ?? courierCode

/**
 * 송장번호 선검증. `trackingFormatPattern`이 null인 택배사는 서버도 패턴을 보지 않으므로 통과시킨다.
 * 패턴은 서버가 준 자유 문자열이라 깨진 정규식이 올 수 있다 — 그때는 막지 않고 서버 판정
 * (400 errorCode 50304)에 맡긴다.
 */
export function matchesTrackingFormat(pattern: string | null, trackingNumber: string): boolean {
  if (pattern == null) return true
  try {
    return new RegExp(pattern).test(trackingNumber)
  } catch {
    return true
  }
}

/** 조회 실패 시 하드코딩 폴백을 부활시키지 않는다 — 고를 수 없는 이유를 그대로 알린다. */
export const COURIER_LOAD_ERROR_MESSAGE = '택배사 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
