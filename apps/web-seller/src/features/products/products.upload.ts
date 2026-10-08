import { issuePresignedUrl } from '@aechak/api'
import { PRODUCT_IMAGE_TYPES } from './products.contract'

// 상품 이미지 업로드 — presigned(purpose=PRODUCT) 발급 → S3 PUT → tmp key. 받은 키를 등록/수정
// 본문(thumbnailImageKey·additionalImageKeys·detailImageKeys)에 실으면 도메인 API가 정식 위치로
// 옮긴다. store-settings.upload.ts(입점 서류)와 같은 3단계 구조이고, 다른 점은 purpose와 허용 형식뿐이다.
//
// PUT은 인증 헤더가 붙은 axios 인스턴스가 아니라 fetch로 보낸다 — presigned URL은 서명 자체가
// 자격증명이고 Authorization 헤더를 얹으면 서명 검증이 깨진다. Content-Type도 발급 때 보낸 값과
// 똑같아야 한다(서명에 박혀 있다). URL 유효시간이 10분이라 저장 직전에 업로드한다.

/** 서버 허용 형식(PRODUCT): 이미지 3종. 그 밖은 발급 단계에서 400/100000. */
export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024

export function isSupportedProductImage(file: File): boolean {
  return PRODUCT_IMAGE_TYPES.includes(file.type)
}

/** 서버 계약에는 크기 상한이 없다(presigned에 content-length 조건을 걸지 않는다) — 10MB는 FE UX 정책. */
export function isWithinProductImageSizeLimit(file: File): boolean {
  return file.size <= MAX_PRODUCT_IMAGE_BYTES
}

export const UNSUPPORTED_PRODUCT_IMAGE_MESSAGE = 'JPG/PNG/WEBP 이미지만 올릴 수 있어요'
export const OVERSIZED_PRODUCT_IMAGE_MESSAGE = `이미지는 1장당 ${MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024}MB까지 올릴 수 있어요`

/** 이미지 한 장을 업로드하고 등록/수정 본문에 실을 tmp 키를 돌려준다. */
export async function uploadProductImage(file: File): Promise<string> {
  const issued = await issuePresignedUrl({ purpose: 'PRODUCT', contentType: file.type })
  const { url, key } = issued.data

  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!response.ok) {
    throw new Error(`이미지 업로드 실패 (${response.status})`)
  }
  return key
}
