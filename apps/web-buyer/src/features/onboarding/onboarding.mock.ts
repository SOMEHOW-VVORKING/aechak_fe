const TAKEN_NICKNAMES = new Set(['관리자', '애착', '테스트', '어드민'])

export function mockCheckNicknameAvailable(nickname: string): Promise<boolean> {
  return new Promise(resolve => {
    setTimeout(() => resolve(!TAKEN_NICKNAMES.has(nickname)), 500)
  })
}
