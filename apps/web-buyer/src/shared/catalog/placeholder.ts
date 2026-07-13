// 네트워크 의존 없이 인라인 SVG data-URI로 만드는 회색/베이지 placeholder 썸네일.
// preview.tsx의 mockImg와 같은 방식 — 실제 상품 이미지가 붙기 전까지 그리드/상세에서 쓴다.
// tone(0~360 hue 힌트)만 살짝 바꿔 카드마다 색이 미묘하게 달라 시각적으로 구분된다.
export function placeholderImage(tone = 32): string {
  const fill = `hsl(${tone}, 18%, 90%)`
  const glyph = `hsl(${tone}, 14%, 74%)`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">` +
    `<rect width="240" height="240" fill="${fill}"/>` +
    `<circle cx="120" cy="104" r="34" fill="${glyph}"/>` +
    `<rect x="70" y="150" width="100" height="14" rx="7" fill="${glyph}"/>` +
    `</svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}
