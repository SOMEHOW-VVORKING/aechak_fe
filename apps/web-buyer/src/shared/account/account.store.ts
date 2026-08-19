import { useSyncExternalStore } from 'react'
import type { BuyerAccount } from '@aechak/domain'

// 구매자 계정 전역 스토어(b10-st-1/2/9). 마이 허브(닉네임/본인인증 배지)·프로필 수정·본인 인증
// 화면이 모두 이 단일 소스를 본다 — feature 간 직접 import가 금지이므로 여러 feature가 공유하는
// 계정 상태를 여기(shared)에 둔다. 찜/장바구니/주문과 동일하게 서버 상태가 아니라 클라이언트
// 목업 상태라 React 내장 useSyncExternalStore로 구현했다(zustand 미도입).

// 시드 계정 — 본인 인증 여부의 진실 원본은 이제 서버(GET /users/me · 인증 confirm 응답)라
// 스토어는 리뷰 화면 등이 읽는 닉네임/프로필 목업만 유지한다(verification은 타입 필수 필드라 시드만 채움).
const SEED_ACCOUNT: BuyerAccount = {
  nickname: '코코집사',
  bio: '코코랑 함께하는 집사일기 🐾 길고양이 정보도 나눠요.',
  email: 'coco****@aechak.co.kr',
  phone: '010-1234-5678',
  verification: 'unverified',
}

let account: BuyerAccount = SEED_ACCOUNT
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): BuyerAccount {
  return account
}

export interface ProfilePatch {
  nickname: string
  bio: string
  avatarUrl?: string
}

/** 프로필(닉네임/자기소개/아바타)을 저장한다. */
export function updateProfile(patch: ProfilePatch): void {
  account = { ...account, ...patch }
  emit()
}

/** 닉네임만 저장한다(온보딩 완료 등 다른 프로필 필드를 건드리지 않는 경로용). */
export function setNickname(nickname: string): void {
  account = { ...account, nickname }
  emit()
}

/** 테스트 격리용 — 시드 상태로 되돌린다. */
export function resetAccount(): void {
  account = SEED_ACCOUNT
  emit()
}

/** 현재 계정(비구독 스냅샷) — 테스트/비React 로직용. */
export function getAccount(): BuyerAccount {
  return account
}

/** 계정을 구독한다. */
export function useAccount(): BuyerAccount {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
