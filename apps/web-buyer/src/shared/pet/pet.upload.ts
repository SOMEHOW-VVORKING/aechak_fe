import { issuePresignedUrl } from '@aechak/api'

// 펫 사진 업로드. presigned URL을 받아 파일을 S3에 직접 PUT하고, 도메인 API에 실을 tmp 키를 돌려준다.
// 업로드가 서버를 거치지 않으므로 이미지 트래픽이 API로 몰리지 않는다.

/** 서버가 허용하는 형식. 그 밖은 발급 단계에서 400이 오므로 미리 걸러 안내한다. */
const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/**
 * 업로드 상한. presigned PUT은 S3 직행이라 서버가 크기를 못 막는다 —
 * 여기서 안 걸면 수십 MB 원본이 그대로 올라가고 목록 로딩까지 느려진다.
 */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export function isSupportedPetPhoto(file: File): boolean {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.type)
}

export function isWithinPhotoSizeLimit(file: File): boolean {
  return file.size <= MAX_PHOTO_BYTES
}

export const UNSUPPORTED_PHOTO_MESSAGE = 'PNG, JPG, WEBP 형식만 올릴 수 있어요'
export const OVERSIZED_PHOTO_MESSAGE = `사진은 ${MAX_PHOTO_BYTES / 1024 / 1024}MB까지 올릴 수 있어요`

/**
 * 파일을 올리고 tmp 키를 반환한다. PUT은 인증 헤더가 붙은 axios 인스턴스가 아니라 fetch로 보낸다 —
 * presigned URL은 서명 자체가 자격증명이고, Authorization 헤더를 얹으면 서명 검증이 깨진다.
 */
export async function uploadPetPhoto(file: File): Promise<string> {
  const issued = await issuePresignedUrl({ purpose: 'PET_PROFILE', contentType: file.type })
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
