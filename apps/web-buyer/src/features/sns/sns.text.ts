// 캡션 글자 규칙(design 6절 5번, G3). 서버와 같은 기준으로 세어 카운터와 서버 판정(130403)이 어긋나지 않게 한다.

export const CAPTION_MAX = 2200

/** NFC 정규화, \r\n을 \n으로, 앞뒤 공백 지우기. 서버가 세기 전에 하는 정리와 같다. 공백뿐이면 빈 문자열이다 */
export function normalizeCaption(text: string): string {
  return text.normalize('NFC').replaceAll('\r\n', '\n').trim()
}

/** 카운터 값. UTF-16 단위가 아니라 코드 포인트로 센다(이모지 하나가 1자). */
export function captionLength(text: string): number {
  return Array.from(normalizeCaption(text)).length
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff

/**
 * 입력이나 붙여넣기로 2,200자를 넘으면 새로 들어온 부분만 넘는 만큼 잘라낸다. 네이티브 maxLength는
 * UTF-16 단위로 세어 이모지가 많으면 카운터가 2,200에 닿기 전에 입력이 멈춰서 쓰지 않는다.
 */
export function clampCaption(prev: string, next: string): string {
  if (captionLength(next) <= CAPTION_MAX) return next
  // 앞뒤로 같은 부분을 빼면 새로 들어온 부분이 남는다. 서로게이트 쌍 가운데서 나누지 않는다.
  let start = 0
  while (start < prev.length && start < next.length && prev[start] === next[start]) start += 1
  if (start > 0 && isHighSurrogate(next.charCodeAt(start - 1))) start -= 1
  let end = 0
  while (
    end < prev.length - start &&
    end < next.length - start &&
    prev[prev.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end += 1
  }
  if (end > 0 && isLowSurrogate(next.charCodeAt(next.length - end))) end -= 1
  const head = next.slice(0, start)
  const tail = next.slice(next.length - end)
  const inserted = Array.from(next.slice(start, next.length - end))
  let keep = inserted.length - (captionLength(next) - CAPTION_MAX)
  while (keep > 0 && captionLength(head + inserted.slice(0, keep).join('') + tail) > CAPTION_MAX) keep -= 1
  const clamped = head + inserted.slice(0, Math.max(0, keep)).join('') + tail
  return captionLength(clamped) <= CAPTION_MAX ? clamped : prev
}

/** 캡션에 #단어를 썼는지. 캡션 속 #단어는 해시태그로 등록되지 않아 해시태그 추가 안내를 보여준다(P3). */
export function hasHashWord(text: string): boolean {
  return /#[^\s#]/u.test(text)
}

// 댓글 글자 규칙(SNS-04 A8, design 6절 5번). 캡션과 같은 정리 뒤 코드 포인트로 센다.
export const COMMENT_MAX = 500

export function commentLength(text: string): number {
  return captionLength(text)
}
