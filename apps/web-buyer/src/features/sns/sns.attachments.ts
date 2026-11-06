import { useEffect, useRef, useState } from 'react'
import {
  VIDEO_MAX_BYTES,
  VIDEO_MAX_MS,
  captureVideoThumbnail,
  encodeSnsPhoto,
  readVideoDuration,
  uploadSnsMedia,
} from './sns.media'

// 작성 화면의 첨부 상태(design 6절 3번, 4번). 고른 사진과 영상을 바로 올리고, 게시 요청에는 올린 tmp key만 싣는다.
// 다시 인코딩한 사진 Blob, 영상 원본과 썸네일 Blob은 들고 있다가 다시 시도와 tmp 원본이 지워진 뒤(100001)의
// 다시 올리기에 그대로 쓴다. 첨부는 없음, 사진 1장부터 10장, 영상 1개 중 하나다(A4).

export const PHOTO_MAX = 10

/**
 * processing은 다시 인코딩이나 영상 길이 읽기와 썸네일 뜨기 중, uploading은 발급과 PUT 중이다.
 * unsupported는 이 기기가 디코딩하지 못하는 영상이라 다시 시도해도 같아 빼기만 보여준다.
 */
export type AttachmentStatus = 'processing' | 'uploading' | 'done' | 'failed' | 'unsupported'

interface AttachmentBase {
  id: string
  file: File
  status: AttachmentStatus
  /** 로컬 object URL. SNS tmp 경로는 CDN으로 읽을 수 없어 업로드 중 미리보기는 이 주소로 그린다 */
  previewUrl?: string
}

export interface PhotoAttachment extends AttachmentBase {
  kind: 'photo'
  /** 다시 인코딩한 JPEG. 미리보기와 업로드가 모두 이 Blob이다 */
  blob?: Blob
  key?: string
}

export interface VideoAttachment extends AttachmentBase {
  kind: 'video'
  durationMs?: number
  /** 첫 장면을 뜬 JPEG 썸네일. 미리보기와 썸네일 업로드가 이 Blob이다 */
  thumbnail?: Blob
  thumbnailKey?: string
  key?: string
  /** 영상 PUT 진행률(0부터 1) */
  progress: number
}

export type Attachment = PhotoAttachment | VideoAttachment

export const ATTACHMENT_NOTICE = {
  photoLimit: `사진은 최대 ${PHOTO_MAX}장까지 올릴 수 있어요`,
  mixed: '사진과 영상은 함께 올릴 수 없어요',
  secondVideo: '영상은 1개만 올릴 수 있어요. 바꾸려면 지금 영상을 먼저 빼 주세요',
  videoSize: '100MB 이하 영상만 올릴 수 있어요',
  videoDuration: '60초 이하 영상만 올릴 수 있어요',
} as const

let seq = 0
const nextId = () => `attachment-${(seq += 1)}`

export function useSnsAttachments({ onNotice }: { onNotice: (message: string) => void }) {
  const [items, setItems] = useState<Attachment[]>([])
  // 빼거나 화면을 닫은 첨부의 object URL을 놓치지 않게 만든 주소를 모두 기억해 둔다.
  // 미리보기 주소가 생기기 전에도 살아 있는 첨부로 표시해 둔다(빈 문자열은 revoke하지 않는다).
  const previewUrls = useRef(new Map<string, string>())
  // 빼거나 화면을 닫은 첨부의 업로드를 끊는다. 첨부마다 하나이고 다시 시도와 다시 올리기도 같은 것을 쓴다.
  const uploads = useRef(new Map<string, AbortController>())
  // 사진 여러 장을 한꺼번에 디코딩하면 휴대폰 메모리가 모자라 다시 인코딩은 한 장씩 한다.
  const encodeQueue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    const urls = previewUrls.current
    const controllers = uploads.current
    return () => {
      urls.forEach(url => url && URL.revokeObjectURL(url))
      urls.clear()
      controllers.forEach(controller => controller.abort())
      controllers.clear()
    }
  }, [])

  const patch = (id: string, change: Partial<PhotoAttachment> | Partial<VideoAttachment>) =>
    setItems(list => list.map(item => (item.id === id ? ({ ...item, ...change } as Attachment) : item)))

  const isAlive = (id: string) => previewUrls.current.has(id)

  // 미리보기 주소는 첨부가 살아 있을 때만 만든다(만드는 사이 뺐으면 거부해 이어지는 업로드도 멈춘다).
  const setPreview = (id: string, blob: Blob) => {
    if (!isAlive(id)) throw new Error('removed')
    const previewUrl = URL.createObjectURL(blob)
    previewUrls.current.set(id, previewUrl)
    return previewUrl
  }

  const encode = (file: File): Promise<Blob> => {
    const task = encodeQueue.current.then(() => encodeSnsPhoto(file))
    encodeQueue.current = task.catch(() => undefined)
    return task
  }

  // 인코딩은 한 번만 하고 업로드만 다시 할 수 있게 Blob이 있으면 인코딩을 건너뛴다.
  const uploadPhoto = async (item: PhotoAttachment): Promise<PhotoAttachment> => {
    const signal = uploads.current.get(item.id)?.signal
    let blob = item.blob
    if (!blob) {
      patch(item.id, { status: 'processing' })
      blob = await encode(item.file)
      patch(item.id, { blob, previewUrl: setPreview(item.id, blob) })
    }
    patch(item.id, { status: 'uploading' })
    const key = await uploadSnsMedia(blob, 'SNS_POST_IMAGE', undefined, signal)
    patch(item.id, { status: 'done', key })
    return { ...item, blob, key, status: 'done' }
  }

  // 썸네일을 뜨고 썸네일(SNS_POST_IMAGE)과 영상(SNS_POST_VIDEO)을 올린다. 이미 끝난 단계는 건너뛴다.
  const uploadVideo = async (item: VideoAttachment): Promise<VideoAttachment> => {
    // 시작할 때 잡아 둔다. 썸네일을 올리는 사이 빼면 끊긴 signal이라 영상은 발급부터 받지 않는다.
    const signal = uploads.current.get(item.id)?.signal
    let { thumbnail, thumbnailKey, key } = item
    if (!thumbnail) {
      patch(item.id, { status: 'processing' })
      thumbnail = await captureVideoThumbnail(item.file)
      patch(item.id, { thumbnail, previewUrl: setPreview(item.id, thumbnail) })
    }
    patch(item.id, { status: 'uploading' })
    thumbnailKey ??= await uploadSnsMedia(thumbnail, 'SNS_POST_IMAGE', undefined, signal)
    patch(item.id, { thumbnailKey })
    // 100MB까지 올리므로 진행률을 보여준다(design 6절 4번).
    key ??= await uploadSnsMedia(item.file, 'SNS_POST_VIDEO', progress => patch(item.id, { progress }), signal)
    patch(item.id, { status: 'done', key, progress: 1 })
    return { ...item, thumbnail, thumbnailKey, key, status: 'done', progress: 1 }
  }

  const upload = (item: Attachment): Promise<Attachment> =>
    item.kind === 'photo' ? uploadPhoto(item) : uploadVideo(item)

  const start = (item: Attachment) => {
    upload(item).catch(() => patch(item.id, { status: 'failed' }))
  }

  const attach = (added: Attachment[]) => {
    for (const item of added) {
      previewUrls.current.set(item.id, '')
      uploads.current.set(item.id, new AbortController())
    }
    setItems(list => [...list, ...added])
  }

  const remove = (id: string) => {
    const url = previewUrls.current.get(id)
    if (url) URL.revokeObjectURL(url)
    previewUrls.current.delete(id)
    uploads.current.get(id)?.abort()
    uploads.current.delete(id)
    setItems(list => list.filter(item => item.id !== id))
  }

  /** 사진을 붙인다. 영상이 있으면 붙이지 않고, 10장을 넘는 사진은 붙이지 않고 안내한다. */
  const addPhotos = (files: File[]) => {
    if (files.length === 0) return
    if (items.some(item => item.kind === 'video')) {
      onNotice(ATTACHMENT_NOTICE.mixed)
      return
    }
    const room = Math.max(0, PHOTO_MAX - items.length)
    const added: PhotoAttachment[] = files
      .slice(0, room)
      .map(file => ({ id: nextId(), kind: 'photo', file, status: 'processing' }))
    if (added.length < files.length) onNotice(ATTACHMENT_NOTICE.photoLimit)
    attach(added)
    added.forEach(start)
  }

  /**
   * 영상을 붙인다. 사진이나 영상이 이미 있거나 100MB를 넘으면 붙이지 않는다. 길이는 메타데이터를 읽어야 알아서
   * 붙인 뒤 60초를 넘으면 빼고 안내한다. 메타데이터를 읽지 못하면 이 기기에서 올릴 수 없는 영상이다.
   */
  const addVideo = (file: File) => {
    if (items.some(item => item.kind === 'photo')) return onNotice(ATTACHMENT_NOTICE.mixed)
    if (items.some(item => item.kind === 'video')) return onNotice(ATTACHMENT_NOTICE.secondVideo)
    if (file.size > VIDEO_MAX_BYTES) return onNotice(ATTACHMENT_NOTICE.videoSize)
    const item: VideoAttachment = { id: nextId(), kind: 'video', file, status: 'processing', progress: 0 }
    attach([item])
    readVideoDuration(file).then(
      durationMs => {
        if (!isAlive(item.id)) return
        if (durationMs > VIDEO_MAX_MS) {
          remove(item.id)
          onNotice(ATTACHMENT_NOTICE.videoDuration)
          return
        }
        patch(item.id, { durationMs })
        start({ ...item, durationMs })
      },
      () => patch(item.id, { status: 'unsupported' }),
    )
  }

  const retry = (id: string) => {
    const item = items.find(entry => entry.id === id)
    if (item?.status === 'failed') start(item)
  }

  /** 순서 바꾸기. 배열 순서가 상세에서 보여주는 순서이고 첫 장이 대표 이미지다(P2). */
  const move = (id: string, offset: -1 | 1) =>
    setItems(list => {
      const from = list.findIndex(item => item.id === id)
      const to = from + offset
      if (from < 0 || to < 0 || to >= list.length) return list
      const next = [...list]
      ;[next[from], next[to]] = [next[to]!, next[from]!]
      return next
    })

  /**
   * 버킷 수명 규칙이 tmp 원본을 지운 뒤(404 100001) 로컬 Blob으로 모두 다시 올린다. 응답에 어느 키인지 없어서
   * 전부 다시 올린다. 하나라도 실패하면 그 첨부에 다시 시도를 보여주고 거부한다.
   */
  const reuploadAll = async (): Promise<Attachment[]> => {
    const fresh = items.map(item =>
      item.kind === 'photo' ? { ...item, key: undefined } : { ...item, key: undefined, thumbnailKey: undefined },
    )
    // 지워진 키는 상태에서도 뺀다. 남기면 다시 올리기가 실패한 뒤의 다시 시도가 그 키를 보고 영상 올리기를 건너뛴다.
    for (const item of fresh) {
      patch(item.id, item.kind === 'photo' ? { key: undefined } : { key: undefined, thumbnailKey: undefined })
    }
    const results = await Promise.allSettled(fresh.map(upload))
    const failed = fresh.filter((_, i) => results[i]!.status === 'rejected')
    failed.forEach(item => patch(item.id, { status: 'failed' }))
    if (failed.length > 0) throw new Error('reupload failed')
    return results.map(result => (result as PromiseFulfilledResult<Attachment>).value)
  }

  return {
    items,
    /** 모든 첨부의 업로드가 끝났는지. 하나라도 진행 중이거나 실패했으면 게시할 수 없다(P13) */
    ready: items.every(item => item.status === 'done'),
    addPhotos,
    addVideo,
    retry,
    remove,
    move,
    reuploadAll,
  }
}
