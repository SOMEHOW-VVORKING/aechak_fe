import { useMutation, useQuery } from '@tanstack/react-query'
import { axiosInstance } from '@aechak/api'
import { mockCheckNicknameAvailable } from './onboarding.mock'

export type SocialProvider = 'kakao' | 'google' | 'apple'

interface SocialLoginResponse {
  accessToken: string
}

export const useSocialLogin = () =>
  useMutation({
    mutationFn: (provider: SocialProvider) =>
      axiosInstance.post<SocialLoginResponse>(`/auth/social/${provider}`).then(r => r.data),
  })

export const NICKNAME_MIN_LENGTH = 2

export const useNicknameAvailability = (nickname: string) =>
  useQuery({
    queryKey: ['onboarding', 'nickname-availability', nickname],
    queryFn: () => mockCheckNicknameAvailable(nickname),
    enabled: nickname.length >= NICKNAME_MIN_LENGTH,
    staleTime: 0,
    retry: false,
  })
