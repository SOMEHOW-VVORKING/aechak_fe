import { describe, it, expect } from 'vitest'
import type { UserMe } from '@aechak/api'
import { accountErrorMessage, toBuyerAccount } from '../account.queries'

describe('toBuyerAccount 매퍼', () => {
  it('[AC-ACCOUNT-MAP-001] ACTIVE 응답을 도메인 계정으로 변환한다(키는 회신용으로 보관)', () => {
    const res: UserMe = {
      status: 'ACTIVE',
      nickname: '코코집사',
      profileImageUrl: 'https://mock-cdn.local/users/profile/seed.png',
      profileImageKey: 'users/profile/seed.png',
      bio: '코코랑 함께하는 집사일기',
      email: 'coco****@aechak.co.kr',
      phoneNumber: null,
      isPhoneVerified: true,
    }
    expect(toBuyerAccount(res)).toEqual({
      nickname: '코코집사',
      bio: '코코랑 함께하는 집사일기',
      email: 'coco****@aechak.co.kr',
      phone: '',
      avatarUrl: 'https://mock-cdn.local/users/profile/seed.png',
      profileImageKey: 'users/profile/seed.png',
      isPendingOnboarding: false,
      verification: 'verified',
    })
  })

  it('[AC-ACCOUNT-MAP-002] PENDING(전부 null) 응답을 화면 친화 기본값으로 안전 변환한다', () => {
    const res: UserMe = {
      status: 'PENDING_ONBOARDING',
      nickname: null,
      profileImageUrl: null,
      profileImageKey: null,
      bio: null,
      email: null,
      phoneNumber: null,
      isPhoneVerified: false,
    }
    expect(toBuyerAccount(res)).toEqual({
      nickname: '',
      bio: '',
      email: '',
      phone: '',
      avatarUrl: undefined,
      profileImageKey: undefined,
      isPendingOnboarding: true,
      verification: 'unverified',
    })
  })
})

describe('accountErrorMessage', () => {
  const err = (status: number, errorCode?: number, message?: string) => ({
    response: { status, data: { errorCode, message } },
  })

  it('[AC-ACCOUNT-MAP-003] 409/30001은 닉네임 중복 문구를 준다', () => {
    expect(accountErrorMessage(err(409, 30001))).toContain('이미 사용 중인 닉네임')
  })

  it('[AC-ACCOUNT-MAP-004] 400/30002는 닉네임 형식 문구를 준다', () => {
    expect(accountErrorMessage(err(400, 30002))).toContain('2~12자')
  })

  it('[AC-ACCOUNT-MAP-005] 409/90003은 동시 수정 문구를 준다', () => {
    expect(accountErrorMessage(err(409, 90003))).toContain('다른 곳에서 먼저 수정')
  })

  it('[AC-ACCOUNT-MAP-006] 403/20006은 온보딩 안내 문구를 준다', () => {
    expect(accountErrorMessage(err(403, 20006))).toContain('온보딩')
  })

  it('[AC-ACCOUNT-MAP-007] 분류되지 않은 오류는 서버 message로 폴백한다', () => {
    expect(accountErrorMessage(err(500, 99999, '서버에서 처리하지 못했습니다.'))).toBe(
      '서버에서 처리하지 못했습니다.',
    )
  })
})
