import { useMutation } from '@tanstack/react-query'
import { mockSocialLogin, type SocialProvider } from './auth.mock'
import { useAuthStore } from './auth.store'

export const useLogin = () =>
  useMutation({
    mutationFn: (provider: SocialProvider) => mockSocialLogin(provider),
    onSuccess: data => {
      useAuthStore.getState().setUser(data.user)
    },
  })
