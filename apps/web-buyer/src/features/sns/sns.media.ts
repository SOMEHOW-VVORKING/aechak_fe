import { issuePresignedUrl } from '@aechak/api'

// 게시물 미디어 준비와 업로드(design 6절 3번, 4번). 브라우저 API(캔버스, <video>, XHR)에 기대는 층이라
// 화면 테스트는 이 모듈을 갈아 끼우고 실제 인코딩과 길이 서명은 E2E(실제 Chromium)가 확인한다.

/** 사진은 긴 변 2,048px 이하로 줄이고 JPEG로 다시 인코딩한다(G2). 다시 인코딩하면 촬영 위치 EXIF도 사라진다. */
export const PHOTO_MAX_EDGE = 2048
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024
export const VIDEO_MAX_MS = 60_000
// 이 시간 안에 메타데이터를 못 읽으면 이 브라우저가 디코딩하지 못하는 영상으로 본다(다시 시도해도 같다).
const VIDEO_META_TIMEOUT_MS = 10_000
const JPEG_QUALITY = 0.9

/** 이 기기에서 디코딩할 수 없는 영상(error 이벤트, 메타데이터 시간 초과, 길이를 모름). 다시 시도 없이 빼기만 보여준다 */
export class VideoUnsupportedError extends Error {}

/** 긴 변이 max 이하가 되게 줄인 크기. 이미 작으면 그대로다. */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

// toBlob은 형식을 주지 않으면 PNG를 내 2,048px 사진이 10MB를 넘을 수 있어 image/jpeg를 명시한다(design 6절 3번).
function drawToJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const size = fitWithin(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('canvas 2d context unavailable'))
  // JPEG에는 투명도가 없어 투명한 PNG가 검게 나오지 않게 흰 바탕을 먼저 깐다.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size.width, size.height)
  context.drawImage(source, 0, 0, size.width, size.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('jpeg encode failed'))), 'image/jpeg', JPEG_QUALITY),
  )
}

/** 사진을 EXIF 방향을 반영해 긴 변 2,048px 이하 JPEG Blob으로 다시 만든다. */
export async function encodeSnsPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    return await drawToJpeg(bitmap, bitmap.width, bitmap.height)
  } finally {
    bitmap.close()
  }
}

function waitFor(video: HTMLVideoElement, event: 'loadedmetadata' | 'seeked', timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new VideoUnsupportedError('video timeout')), timeoutMs)
    const onEvent = () => finish()
    const onError = () => finish(new VideoUnsupportedError('video decode error'))
    function finish(error?: Error) {
      clearTimeout(timer)
      video.removeEventListener(event, onEvent)
      video.removeEventListener('error', onError)
      if (error) reject(error)
      else resolve()
    }
    video.addEventListener(event, onEvent)
    video.addEventListener('error', onError)
  })
}

async function withVideo<T>(file: Blob, run: (video: HTMLVideoElement) => Promise<T>): Promise<T> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
  try {
    const loaded = waitFor(video, 'loadedmetadata', VIDEO_META_TIMEOUT_MS)
    video.src = url
    await loaded
    return await run(video)
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

/** 영상 길이(밀리초). error 이벤트, 시간 초과, 길이를 알 수 없는 영상이면 VideoUnsupportedError다. */
export function readVideoDuration(file: Blob): Promise<number> {
  return withVideo(file, async video => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new VideoUnsupportedError('unknown duration')
    return Math.round(video.duration * 1000)
  })
}

/** 영상 첫 장면을 캔버스로 떠서 JPEG 썸네일을 만든다(G1). 실패하면 화면이 다시 시도와 빼기를 보여준다. */
export function captureVideoThumbnail(file: Blob): Promise<Blob> {
  return withVideo(file, async video => {
    // 사파리는 재생 전에는 프레임을 그리지 않아 첫 장면 근처로 이동해 디코딩을 한 번 일으킨다.
    const seeked = waitFor(video, 'seeked', VIDEO_META_TIMEOUT_MS)
    video.currentTime = Math.min(0.1, video.duration / 2)
    await seeked
    if (video.videoWidth === 0 || video.videoHeight === 0) throw new Error('no video frame')
    return drawToJpeg(video, video.videoWidth, video.videoHeight)
  })
}

// presigned URL은 서명이 자격 증명이라 인증 헤더가 붙은 axios가 아니라 XHR로 보낸다(fetch는 업로드 진행률을 주지 않는다).
function putBlob(url: string, blob: Blob, onProgress?: (ratio: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', blob.type)
    if (onProgress) {
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) onProgress(event.loaded / event.total)
      }
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('upload network error'))
    xhr.send(blob)
  })
}

/**
 * presigned 발급과 PUT. 발급의 contentType과 contentLength는 보낼 Blob의 type과 size이고 PUT도 같은 Blob이다.
 * 서버가 길이를 서명에 넣어 다른 길이를 보내면 S3가 403으로 거부한다(sns.yaml FE 6).
 */
export async function uploadSnsMedia(
  blob: Blob,
  purpose: 'SNS_POST_IMAGE' | 'SNS_POST_VIDEO',
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const issued = await issuePresignedUrl({ purpose, contentType: blob.type, contentLength: blob.size })
  await putBlob(issued.data.url, blob, onProgress)
  return issued.data.key
}
