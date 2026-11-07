import { describe, expect, it } from 'vitest'
import { clampSize, decodeCursorPayload, encodeCursorPayload } from '../base'

// MSW 핸들러 셋이 공유하는 커서 인코더. 핸들러 하나가 payload에 비아스키를 넣는 순간 전부가
// 함께 죽는 자리라, 라우트 테스트가 아니라 여기서 직접 고정한다.

describe('encodeCursorPayload / decodeCursorPayload', () => {
  it('아스키 payload는 base64url로 왕복한다', () => {
    const payload = 'arv|1a2b3c4d|51204'
    const encoded = encodeCursorPayload(payload)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeCursorPayload(encoded)).toBe(payload)
  })

  it('비아스키 payload도 터지지 않고 왕복한다', () => {
    // `btoa`를 바로 쓰면 여기서 InvalidCharacterError가 나고 핸들러가 그 자리에서 죽는다 —
    // 실서버는 UTF-8 바이트를 base64로 싸므로 더블도 그래야 한다.
    const payload = 'arv|사료 후기|70020'
    expect(() => encodeCursorPayload(payload)).not.toThrow()
    expect(decodeCursorPayload(encodeCursorPayload(payload))).toBe(payload)
  })

  it('base64가 아닌 커서와 UTF-8이 아닌 바이트열은 null이다', () => {
    expect(decodeCursorPayload('!!! not base64 !!!')).toBeNull()
    // 0xff는 어떤 UTF-8 시퀀스의 시작도 될 수 없다 — 되살려 통과시키면 깨진 커서가 조용히 지나간다.
    expect(decodeCursorPayload(btoa('ÿþ').replace(/=+$/, ''))).toBeNull()
  })
})

describe('clampSize', () => {
  it('없으면 기본값, 범위를 벗어나면 1~100으로 자른다', () => {
    expect(clampSize(null)).toBe(20)
    expect(clampSize('0')).toBe(1)
    expect(clampSize('-5')).toBe(1)
    expect(clampSize('1000')).toBe(100)
    expect(clampSize('30')).toBe(30)
  })
})
