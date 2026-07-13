import type { ReactNode } from 'react'
import { Toast, type ToastVariant } from '@aechak/design-system/web'

// 하단 고정 액션바(BottomFixedAction/DetailActionBar, 모두 lg 버튼 기준 높이 ~68~72px)
// 위로 토스트를 띄울 때 쓰는 기본 오프셋. env(safe-area-inset-bottom)까지 더해 액션바 전체
// 높이를 넘기므로 토스트가 항상 액션바 위(약 24px 여유)에 뜬다.
const ACTION_BAR_OFFSET = 'calc(72px + env(safe-area-inset-bottom))'

export interface AppToastProps {
  open: boolean
  onClose: () => void
  message: ReactNode
  variant?: ToastVariant
  duration?: number
  // 하단 고정 액션바가 있는 화면에서 켜면 토스트를 액션바 위로 띄운다.
  aboveActionBar?: boolean
}

// web-buyer 공용 토스트 래퍼 — web-buyer의 모든 토스트는 이 컴포넌트를 유일한 통로로 쓴다.
//
// (1) 2줄 깨짐: DS `Toast`는 하단 중앙 고정 + 폭 미명시(shrink-to-fit)라 한글(CJK)이 글자 사이
//     어디서나 줄바꿈돼 2줄로 깨진다. DS `Toast`는 4개 앱 공용이라 수정할 수 없으므로, 소비 앱
//     레벨의 이 래퍼에서 message를 `whitespace-nowrap` span으로 감싸 항상 한 줄로 렌더한다.
//     message에는 아이콘을 직접 넣지 말 것 — variant별 아이콘은 DS `Toast`가 이미 그린다(중복 방지).
//
// (2) 액션바 겹침: DS `Toast`는 `position:fixed`라 부모가 위치를 못 옮긴다. `aboveActionBar`가
//     켜지면 토스트를 `position:absolute; bottom:<액션바 높이>; translateZ(0)`인 전체폭 컨테이너로
//     감싼다 — translateZ가 이 div를 fixed 토스트의 containing block으로 만들어(앱이 폰 프레임에
//     쓰는 것과 동일한 트릭, routes/__root.tsx 참고), 토스트의 `bottom-6`이 프레임 바닥이 아니라
//     액션바 위에서 측정된다. 컨테이너는 높이 0(inflow 콘텐츠 없음)이라 클릭을 막지 않고,
//     z-toast로 액션바(z-sticky) 위에 그려진다. DS `Toast` 수정 0.
export function AppToast({ message, aboveActionBar = false, ...props }: AppToastProps) {
  const toast = <Toast {...props} message={<span className="whitespace-nowrap">{message}</span>} />
  if (!aboveActionBar) return toast
  return (
    <div className="absolute inset-x-0 z-toast [transform:translateZ(0)]" style={{ bottom: ACTION_BAR_OFFSET }}>
      {toast}
    </div>
  )
}
