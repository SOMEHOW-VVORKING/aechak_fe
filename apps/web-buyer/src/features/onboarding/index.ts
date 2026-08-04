export {
  WEB_LOGIN_PROVIDERS,
  socialLoginRedirectUrl,
  bootstrapSession,
  useTerms,
  toOnboardingTerm,
  useSubmitConsents,
  useNicknameAvailability,
  useSetNickname,
  normalizeNickname,
  isValidNicknameFormat,
  onboardingErrorMessage,
  readErrorCode,
  NICKNAME_MIN_LENGTH,
  NICKNAME_MAX_LENGTH,
} from './onboarding.queries'
export type { SocialProvider, OnboardingTerm, ConsentInput } from './onboarding.queries'
export { OnboardingHeader } from './components/OnboardingHeader'
