import { issuePresignedUrl } from '@aechak/api'

// 입점 서류 업로드 — presigned(purpose=SELLER_DOCUMENT) 발급 → S3 PUT → tmp key.
// web-buyer의 pet/account 업로드와 같은 3단계 구조. PUT은 인증 헤더가 붙은 axios 인스턴스가
// 아니라 fetch로 보낸다 — presigned URL은 서명 자체가 자격증명이고, Authorization 헤더를
// 얹으면 서명 검증이 깨진다. URL 유효시간이 10분이라 저장 직전에 업로드한다.

// 서버 허용 타입(SELLER_DOCUMENT): 이미지 3종 + PDF. 크기 제한은 서버 계약에 없어 FE UX 정책.
const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

export function isSupportedDocument(file: File): boolean {
  return ALLOWED_CONTENT_TYPES.includes(file.type)
}

export function isWithinDocumentSizeLimit(file: File): boolean {
  return file.size <= MAX_DOCUMENT_BYTES
}

export const UNSUPPORTED_DOCUMENT_MESSAGE = 'PNG, JPG, WEBP, PDF 형식만 올릴 수 있어요'
export const OVERSIZED_DOCUMENT_MESSAGE = `서류는 ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB까지 올릴 수 있어요`

/** 서류 한 건을 업로드하고 임시저장 documents[].tmpKey로 쓸 키를 돌려준다. */
export async function uploadSellerDocument(file: File): Promise<string> {
  const issued = await issuePresignedUrl({ purpose: 'SELLER_DOCUMENT', contentType: file.type })
  const { url, key } = issued.data

  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!response.ok) {
    throw new Error(`서류 업로드 실패 (${response.status})`)
  }
  return key
}
