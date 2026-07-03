import { useMutation } from '@tanstack/react-query'
import { axiosInstance } from '@aechak/api'
import type { User } from '@aechak/domain'
import { useAuthStore } from './auth.store'

interface LoginBody {
  email: string
  password: string
}

interface LoginResponse {
  user: User
  accessToken: string
}

export const useLogin = () =>
  useMutation({
    mutationFn: (body: LoginBody) =>
      axiosInstance.post<LoginResponse>('/auth/login', body).then(r => r.data),
    onSuccess: data => {
      useAuthStore.getState().setUser(data.user)
    },
  })
