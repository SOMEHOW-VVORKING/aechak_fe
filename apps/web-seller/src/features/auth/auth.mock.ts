import type { User } from '@aechak/domain'

export type SocialProvider = 'kakao' | 'google' | 'apple'

const DELAY_MS = 400

const MOCK_USER: User = {
  id: 'seller-1',
  email: 'seller@aechak.com',
  name: '냥이상점 대표',
  role: 'seller',
  createdAt: '2026-01-01T00:00:00.000Z',
}

export function mockSocialLogin(provider: SocialProvider): Promise<{ user: User; provider: SocialProvider }> {
  return new Promise(resolve => {
    setTimeout(() => resolve({ user: MOCK_USER, provider }), DELAY_MS)
  })
}
