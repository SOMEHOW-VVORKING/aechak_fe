import { describe, expect, it } from 'vitest'
import { CAPTION_MAX, captionLength, clampCaption, hasHashWord } from '../sns.text'

describe('sns.text 캡션 규칙', () => {
  it('서버처럼 NFC 정규화, 줄바꿈 정리, 앞뒤 공백 지우기 뒤 코드 포인트로 센다', () => {
    // 한글 자모 조합형(ᄒ+ᅡ+ᆫ)은 NFC로 한 글자다.
    expect(captionLength('한')).toBe(1)
    expect(captionLength('  가\r\n나  ')).toBe(3)
    expect(captionLength('🐶🐱')).toBe(2)
    expect(captionLength('   ')).toBe(0)
  })

  it('넘친 만큼 새로 들어온 부분만 자르고 앞뒤 글은 그대로 둔다', () => {
    const prev = `${'가'.repeat(CAPTION_MAX - 2)}끝`
    // 가운데(끝 앞)에 세 글자를 붙여넣으면 한 글자만 들어간다.
    const next = `${'가'.repeat(CAPTION_MAX - 2)}나다라끝`
    expect(clampCaption(prev, next)).toBe(`${'가'.repeat(CAPTION_MAX - 2)}나끝`)
  })

  it('서로게이트 쌍을 가운데서 자르지 않는다', () => {
    const prev = '😀'.repeat(CAPTION_MAX - 1)
    const clamped = clampCaption(prev, `${prev}😁😂`)
    expect(Array.from(clamped)).toHaveLength(CAPTION_MAX)
    expect(clamped.endsWith('😁')).toBe(true)
    expect(clamped).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/)
  })

  it('#다음에 글자가 오면 해시태그 추가 안내 대상이다', () => {
    expect(hasHashWord('오늘 #산책')).toBe(true)
    expect(hasHashWord('오늘 # 산책')).toBe(false)
    expect(hasHashWord('##')).toBe(false)
  })
})
