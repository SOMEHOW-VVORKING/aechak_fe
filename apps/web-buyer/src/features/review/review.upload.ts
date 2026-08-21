import { issuePresignedUrl } from '@aechak/api'

// 리뷰 사진 업로드. presigned URL을 받아 파일을 S3에 직접 PUT하고, 리뷰 작성 API에 실을 tmp 키를
// 돌려준다. 업로드가 서버를 거치지 않으므로 이미지 트래픽이 API로 몰리지 않는다.
// shared/pet·shared/account의 업로드 유틸과 같은 구조다 — boundaries 규칙상 서로 재사용하지 못해
// purpose만 다른 형태로 복제한다(그쪽 파일 주석에도 같은 이유가 적혀 있다).

/** 서버가 허용하는 형식. 그 밖은 발급 단계에서 400이 오므로 미리 걸러 안내한다. */
const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/**
 * 업로드 상한. presigned PUT은 S3 직행이라 서버가 크기를 못 막는다 —
 * 여기서 안 걸면 수십 MB 원본이 그대로 올라간다.
 */
export const MAX_REVIEW_PHOTO_BYTES = 5 * 1024 * 1024

/** 리뷰 한 건에 붙일 수 있는 사진 수(서버도 초과 시 110009로 막는다). */
export const MAX_REVIEW_PHOTOS = 5

export function isSupportedReviewPhoto(file: File): boolean {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.type)
}

export function isWithinReviewPhotoSizeLimit(file: File): boolean {
  return file.size <= MAX_REVIEW_PHOTO_BYTES
}

export const UNSUPPORTED_REVIEW_PHOTO_MESSAGE = 'PNG, JPG, WEBP 형식만 올릴 수 있어요'
export const OVERSIZED_REVIEW_PHOTO_MESSAGE = `사진은 ${MAX_REVIEW_PHOTO_BYTES / 1024 / 1024}MB까지 올릴 수 있어요`

/**
 * 파일을 올리고 tmp 키를 반환한다. PUT은 인증 헤더가 붙은 axios 인스턴스가 아니라 fetch로 보낸다 —
 * presigned URL은 서명 자체가 자격증명이고, Authorization 헤더를 얹으면 서명 검증이 깨진다.
 */
export async function uploadReviewPhoto(file: File): Promise<string> {
  const issued = await issuePresignedUrl({ purpose: 'REVIEW_IMAGE', contentType: file.type })
  const { url, key } = issued.data

  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!response.ok) {
    throw new Error(`사진 업로드 실패 (${response.status})`)
  }
  return key
}
