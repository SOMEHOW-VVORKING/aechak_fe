import { useEffect, useRef, useState } from 'react'
import { encodeSnsPhoto, uploadSnsMedia } from './sns.media'

// 작성 화면의 첨부 상태(design 6절 3번). 고른 사진을 다시 인코딩해 바로 올리고, 게시 요청에는 올린 tmp key만 싣는다.
// 다시 인코딩한 Blob은 들고 있다가 다시 시도와 tmp 원본이 지워진 뒤(100001)의 다시 올리기에 그대로 쓴다.

export const PHOTO_MAX = 10

/** processing은 다시 인코딩 중, uploading은 발급과 PUT 중이다 */
export type AttachmentStatus = 'processing' | 'uploading' | 'done' | 'failed'

export interface PhotoAttachment {
  id: string
  kind: 'photo'
  file: File
  status: AttachmentStatus
  /** 다시 인코딩한 JPEG. 미리보기와 업로드가 모두 이 Blob이다 */
  blob?: Blob
  /** 로컬 object URL. SNS tmp 경로는 CDN으로 읽을 수 없어 업로드 중 미리보기는 이 주소로 그린다 */
  previewUrl?: string
  key?: string
}

export type Attachment = PhotoAttachment

let seq = 0
const nextId = () => `attachment-${(seq += 1)}`

export function useSnsAttachments() {
  const [items, setItems] = useState<Attachment[]>([])
  // 빼거나 화면을 닫은 첨부의 object URL을 놓치지 않게 만든 주소를 모두 기억해 둔다.
  const previewUrls = useRef(new Map<string, string>())
  // 사진 여러 장을 한꺼번에 디코딩하면 휴대폰 메모리가 모자라 다시 인코딩은 한 장씩 한다.
  const encodeQueue = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    const urls = previewUrls.current
    return () => {
      urls.forEach(url => url && URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  const patch = (id: string, change: Partial<Attachment>) =>
    setItems(list => list.map(item => (item.id === id ? { ...item, ...change } : item)))

  const encode = (file: File): Promise<Blob> => {
    const task = encodeQueue.current.then(() => encodeSnsPhoto(file))
    encodeQueue.current = task.catch(() => undefined)
    return task
  }

  // 인코딩은 한 번만 하고 업로드만 다시 할 수 있게 Blob이 있으면 인코딩을 건너뛴다.
  const upload = async (item: Pick<PhotoAttachment, 'id' | 'file' | 'blob'>): Promise<string> => {
    let blob = item.blob
    if (!blob) {
      patch(item.id, { status: 'processing' })
      blob = await encode(item.file)
      // 인코딩하는 사이 뺀 사진이면 미리보기 주소를 만들지 않는다.
      if (!previewUrls.current.has(item.id)) throw new Error('removed')
      const previewUrl = URL.createObjectURL(blob)
      previewUrls.current.set(item.id, previewUrl)
      patch(item.id, { blob, previewUrl })
    }
    patch(item.id, { status: 'uploading' })
    const key = await uploadSnsMedia(blob, 'SNS_POST_IMAGE')
    patch(item.id, { status: 'done', key })
    return key
  }

  const start = (item: Pick<PhotoAttachment, 'id' | 'file' | 'blob'>) => {
    upload(item).catch(() => patch(item.id, { status: 'failed' }))
  }

  /** 사진을 붙인다. 10장을 넘는 사진은 붙이지 않고 몇 장을 버렸는지 돌려준다(화면이 안내한다). */
  const addPhotos = (files: File[]): number => {
    const room = Math.max(0, PHOTO_MAX - items.length)
    const added: PhotoAttachment[] = files
      .slice(0, room)
      .map(file => ({ id: nextId(), kind: 'photo', file, status: 'processing' }))
    // 미리보기 주소가 생기기 전에도 살아 있는 첨부로 표시해 둔다(빈 문자열은 revoke하지 않는다).
    for (const item of added) previewUrls.current.set(item.id, '')
    setItems(list => [...list, ...added])
    added.forEach(start)
    return files.length - added.length
  }

  const retry = (id: string) => {
    const item = items.find(entry => entry.id === id)
    if (item?.status === 'failed') start(item)
  }

  const remove = (id: string) => {
    const url = previewUrls.current.get(id)
    if (url) URL.revokeObjectURL(url)
    previewUrls.current.delete(id)
    setItems(list => list.filter(item => item.id !== id))
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
   * 전부 다시 올린다. 하나라도 실패하면 그 사진에 다시 시도를 보여주고 거부한다.
   */
  const reuploadAll = async (): Promise<Attachment[]> => {
    const current = items
    const keys = await Promise.allSettled(current.map(item => upload(item)))
    const failed = current.filter((_, i) => keys[i]!.status === 'rejected')
    failed.forEach(item => patch(item.id, { status: 'failed' }))
    if (failed.length > 0) throw new Error('reupload failed')
    return current.map((item, i) => ({ ...item, status: 'done', key: (keys[i] as PromiseFulfilledResult<string>).value }))
  }

  return {
    items,
    /** 모든 첨부의 업로드가 끝났는지. 하나라도 진행 중이거나 실패했으면 게시할 수 없다(P13) */
    ready: items.every(item => item.status === 'done'),
    addPhotos,
    retry,
    remove,
    move,
    reuploadAll,
  }
}
