// 비회원 로그인 유도 게이트 + 로그인 여부 mock 스토어 배럴. feature 간 직접 import가
// 금지이므로 여러 화면(상품 상세·설정 홈 등)이 공유하는 인증 상태·게이트는 여기서 읽는다.
export { getIsLoggedIn, login, logout, resetAuth, useIsLoggedIn } from './auth.store'
export { endServerSession } from './auth.session'
export { LoginGate, useLoginGate } from './LoginGate'
export type { GateFeature, GateResume, LoginGateProps, UseLoginGate } from './LoginGate'
export {
  clearPendingAction,
  peekPendingAction,
  resumeReturnPath,
  takePendingAction,
} from './pending-action'
export type { PendingAction } from './pending-action'
