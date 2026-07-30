import { placeholderImage } from './placeholder'

// 서버 이미지 필드(thumbnailImageKey/representativeImageKey/storageKey/iconUrl 등)는 전부 S3
// 스토리지 키이고 전체 URL이 아니다. CDN base(VITE_MEDIA_BASE_URL)가 설정돼 있을 때만 key를 실
// URL로 조립하고, 없으면 지금까지처럼 placeholder로 폴백한다. 마켓 매퍼와 상품 상세 매퍼가 함께
// 써야 해서 shared/catalog에 둔다(feature 간 직접 import가 금지라 공용 위치가 필요).
export function mediaUrl(key: string | null | undefined, tone?: number): string {
  const base = import.meta.env['VITE_MEDIA_BASE_URL']
  if (key && base) {
    return `${base.replace(/\/$/, '')}/${key.replace(/^\//, '')}`
  }
  return placeholderImage(tone)
}
