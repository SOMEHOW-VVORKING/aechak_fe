// 구매자 계정 공용 스토어 배럴. feature 간 직접 import가 금지이므로 여러 화면이 공유하는
// 계정 상태(닉네임/자기소개/본인 인증)는 여기서 읽는다(마이 허브/프로필 수정/본인 인증).
export { updateProfile, setNickname, resetAccount, getAccount, useAccount } from './account.store'
export type { ProfilePatch } from './account.store'
export {
  ACCOUNT_QUERY_KEY,
  accountErrorMessage,
  isOnboardingRequired,
  toBuyerAccount,
  useMe,
  useUpdateProfile,
} from './account.queries'
export {
  isSupportedAvatar,
  isWithinAvatarSizeLimit,
  uploadAvatar,
  MAX_AVATAR_BYTES,
  OVERSIZED_AVATAR_MESSAGE,
  UNSUPPORTED_AVATAR_MESSAGE,
} from './account.upload'
