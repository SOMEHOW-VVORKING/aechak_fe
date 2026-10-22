import type { SnsToggleKind } from './sns.queries'

// 차단, 차단 해제, 뮤트 해제 확인 Modal(b7-st-8 8-B). 프로필과 관리 목록이 같은 문구를 쓴다.
// 확인 버튼 라벨은 뒤에 깔린 버튼(차단 해제, 뮤트 해제)과 겹치지 않게 짧게 적는다.
export type RelationConfirm = 'block' | 'unblock' | 'unmute'

export const RELATION_CONFIRM: Record<
  RelationConfirm,
  {
    kind: SnsToggleKind
    on: boolean
    title: string
    description: (nickname: string) => string
    confirmLabel: string
    danger: boolean
    done: string
  }
> = {
  block: {
    kind: 'block',
    on: true,
    title: '차단할까요?',
    description: nickname =>
      `${nickname}님은 회원님의 게시물과 프로필을 볼 수 없고 서로 팔로우가 해제돼요.`,
    confirmLabel: '차단',
    danger: true,
    done: '차단했어요',
  },
  unblock: {
    kind: 'block',
    on: false,
    title: '차단을 해제할까요?',
    description: nickname =>
      `${nickname}님이 회원님의 게시물과 프로필을 다시 볼 수 있어요. 해제된 팔로우는 되살아나지 않아요.`,
    confirmLabel: '해제',
    danger: false,
    done: '차단을 해제했어요',
  },
  unmute: {
    kind: 'mute',
    on: false,
    title: '뮤트를 해제할까요?',
    description: nickname => `${nickname}님의 게시물이 다시 피드에 보이게 돼요. 언제든 다시 뮤트할 수 있어요.`,
    confirmLabel: '해제',
    danger: false,
    done: '뮤트를 해제했어요',
  },
}
