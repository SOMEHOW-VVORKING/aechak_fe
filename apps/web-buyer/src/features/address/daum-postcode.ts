// Daum(Kakao) 우편번호 서비스 실연동 — API 키 불필요, 한국 주소 표준. 스크립트를 시트를 처음
// 열 때 온디맨드로 주입하고(once-guard로 중복 로드 방지), Promise로 로드 완료를 기다린다.
// 팝업(새 창) 대신 embed 모드로 시트 내부 컨테이너에 임베드한다(모바일/웹뷰 친화).

export const DAUM_POSTCODE_SRC =
  'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'

// oncomplete 콜백이 받는 데이터 중 이 화면이 실제로 쓰는 필드만 좁게 선언한다(any 지양).
export interface DaumPostcodeData {
  /** 우편번호(5자리). form.zipcode 로 채운다. */
  zonecode: string
  /** 도로명 주소. form.address1 의 기본. */
  roadAddress: string
  /** 지번 주소. */
  jibunAddress: string
  /** 건물명(없으면 빈 문자열). 있으면 도로명 주소 뒤에 괄호로 덧붙인다. */
  buildingName: string
  /** 공동주택 여부('Y'/'N'). */
  apartment: 'Y' | 'N'
}

interface DaumPostcodeOptions {
  oncomplete: (data: DaumPostcodeData) => void
  onclose?: (state: 'FORCE_CLOSE' | 'COMPLETE_CLOSE') => void
  width?: string | number
  height?: string | number
}

interface DaumPostcodeInstance {
  embed: (element: HTMLElement) => void
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: DaumPostcodeOptions) => DaumPostcodeInstance
    }
  }
}

let loadPromise: Promise<void> | null = null

// Daum 우편번호 스크립트를 한 번만 로드한다(중복 주입 방지). 이미 로드돼 있으면 즉시 resolve하고,
// 로드 실패 시 다음 열기에서 재시도할 수 있도록 캐시를 비운다.
export function loadDaumPostcode(): Promise<void> {
  if (typeof window !== 'undefined' && window.daum?.Postcode) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = DAUM_POSTCODE_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loadPromise = null
      reject(new Error('Daum 우편번호 스크립트를 불러오지 못했어요'))
    }
    document.head.appendChild(script)
  })
  return loadPromise
}
