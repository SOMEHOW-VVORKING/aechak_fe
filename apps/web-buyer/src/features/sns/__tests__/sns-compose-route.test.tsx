import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout } from '@/shared/auth'
import {
  PRESIGNED_URL,
  SNS_ME,
  SNS_POSTS_URL,
  currentSns,
  expireSnsUploads,
  seedSns,
  server,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'
import type * as SnsMedia from '../sns.media'

// jsdom에는 createImageBitmap, 캔버스 인코딩, 영상 디코딩이 없다. 그 셋만 갈아 끼우고 발급과 PUT은 실제 코드로 보낸다.
// 인코딩 결과는 파일 이름을 담은 JPEG라 크기(contentLength)로 어느 사진인지 알 수 있다.
// 영상 길이는 파일 이름으로 정한다(long은 75초, broken은 디코딩 실패). nothumb는 첫 썸네일 뜨기에 실패한다.
const thumbnailFailures = new Set<string>()
vi.mock('../sns.media', async importOriginal => {
  const actual = await importOriginal<typeof SnsMedia>()
  return {
    ...actual,
    encodeSnsPhoto: vi.fn(async (file: File) => new Blob([file.name], { type: 'image/jpeg' })),
    readVideoDuration: vi.fn(async (file: File) => {
      if (file.name.startsWith('broken')) throw new actual.VideoUnsupportedError('decode error')
      return file.name.startsWith('long') ? 75_000 : 42_500
    }),
    captureVideoThumbnail: vi.fn(async (file: File) => {
      if (thumbnailFailures.delete(file.name)) throw new Error('no frame')
      return new Blob(['thumb'], { type: 'image/jpeg' })
    }),
  }
})

function renderAt(path: string) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const photo = (name: string) => new File(['raw'], name, { type: 'image/jpeg' })
const video = (name: string) => new File(['video'], name, { type: 'video/mp4' })
const publishButton = () => screen.getByRole('button', { name: '게시' })

interface PostRequest {
  key: string | null
  body: Record<string, unknown>
}
let postRequests: PostRequest[] = []
let presignCount = 0

beforeEach(() => {
  setAccessToken('test-token')
  postRequests = []
  presignCount = 0
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'POST' && request.url.endsWith('/sns/posts')) {
      postRequests.push({ key: request.headers.get('Idempotency-Key'), body: await request.clone().json() })
    }
    if (request.method === 'POST' && request.url.endsWith('/files/presigned-url')) presignCount += 1
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

async function attach(user: ReturnType<typeof userEvent.setup>, ...names: string[]) {
  await user.upload(screen.getByLabelText('사진 파일'), names.map(photo))
}

const tiles = () => within(screen.getByRole('list', { name: '첨부' })).getAllByRole('img')

describe('/sns/posts/new 게시', () => {
  it('[AC-SNS02-004] 첨부 없이 캡션만 게시하면 텍스트 게시물이 생기고 상세로 간다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sns/posts/new')

    await user.type(await screen.findByLabelText('캡션'), '  산책 다녀왔어요  ')
    await user.click(publishButton())

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sns\/posts\/01K/))
    expect(await screen.findByText('산책 다녀왔어요')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /사진/ })).not.toBeInTheDocument()
    expect(postRequests).toHaveLength(1)
    expect(postRequests[0]!.body).toEqual({ caption: '산책 다녀왔어요' })
    expect(postRequests[0]!.key).toMatch(/.+/)
  })

  it('[AC-SNS02-005] 캡션이 비었거나 공백뿐이고 첨부가 없으면 게시 버튼이 꺼져 있다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/posts/new')

    expect(await screen.findByRole('button', { name: '게시' })).toBeDisabled()
    await user.type(screen.getByLabelText('캡션'), '   ')
    expect(publishButton()).toBeDisabled()
    await user.type(screen.getByLabelText('캡션'), '글')
    expect(publishButton()).toBeEnabled()
  })

  it('[AC-SNS02-006] 사진 10장을 넘게 고르면 넘는 사진은 붙이지 않고 최대 10장이라고 안내한다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    await screen.findByLabelText('캡션')

    await attach(user, ...Array.from({ length: 11 }, (_, i) => `p${i}.jpg`))
    expect(await screen.findByText('사진은 최대 10장까지 올릴 수 있어요')).toBeInTheDocument()
    await waitFor(() => expect(tiles()).toHaveLength(10))
    expect(screen.queryByRole('button', { name: '사진 추가' })).not.toBeInTheDocument()

    await attach(user, 'more.jpg')
    expect(tiles()).toHaveLength(10)
    await waitFor(() => expect(publishButton()).toBeEnabled())
  })

  it('[AC-SNS02-008] 캡션이 2,200자에 닿으면 더 입력하거나 붙여넣어도 들어가지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    const caption = await screen.findByLabelText<HTMLTextAreaElement>('캡션')

    await user.click(caption)
    await user.paste('가'.repeat(2199))
    expect(screen.getByText('2199/2200')).toBeInTheDocument()
    await user.paste('나다라')
    expect(caption.value).toBe(`${'가'.repeat(2199)}나`)
    expect(screen.getByText('2200/2200')).toBeInTheDocument()
    await user.type(caption, '마')
    expect(caption.value).toHaveLength(2200)
  })

  it('[AC-SNS02-008] 이모지는 한 글자로 세어 UTF-16 길이가 아니라 코드 포인트 2,200자까지 들어간다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    const caption = await screen.findByLabelText<HTMLTextAreaElement>('캡션')

    await user.click(caption)
    await user.paste('🐶'.repeat(2300))
    expect(screen.getByText('2200/2200')).toBeInTheDocument()
    expect(Array.from(caption.value)).toHaveLength(2200)
    expect(caption.value).toHaveLength(4400)
  })

  it('[AC-SNS02-009] 옮긴 순서대로 상세에서 사진이 나오고 사진을 빼도 나머지 순서는 그대로다', async () => {
    // 발급 키에 인코딩 결과 크기를 넣어 상세 사진 주소로 어느 사진인지 알아본다.
    server.use(
      http.post(PRESIGNED_URL, async ({ request }) => {
        const body = (await request.json()) as { contentLength: number }
        const key = `tmp/1/sns/posts/images/size-${body.contentLength}.jpeg`
        return HttpResponse.json({ data: { url: `https://fake-s3.local/${key}?type=image%2Fjpeg`, key } })
      }),
    )
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    await screen.findByLabelText('캡션')

    // 이름 길이가 곧 인코딩 결과 크기다(a.jpg 5, bb.jpg 6, ccc.jpg 7, dddd.jpg 8).
    await attach(user, 'a.jpg', 'bb.jpg', 'ccc.jpg', 'dddd.jpg')
    await waitFor(() => expect(publishButton()).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '사진 3 앞으로' }))
    await user.click(screen.getByRole('button', { name: '사진 2 앞으로' }))
    await user.click(screen.getByRole('button', { name: '사진 3 빼기' }))
    await user.click(publishButton())

    const photos = await screen.findAllByRole('img', { name: /^사진 \d\/3$/ })
    expect(photos.map(img => img.getAttribute('src')?.match(/size-(\d+)/)?.[1])).toEqual(['7', '5', '8'])
  })
})

describe('/sns/posts/new 실패와 다시 시도', () => {
  it('[AC-SNS02-030] 게시 버튼을 연타해도 게시물은 하나만 생긴다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sns/posts/new')
    await user.type(await screen.findByLabelText('캡션'), '한 번만')
    const before = currentSns().posts.length

    await user.dblClick(publishButton())
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sns\/posts\/01K/))
    expect(currentSns().posts).toHaveLength(before + 1)
    expect(new Set(postRequests.map(r => r.key)).size).toBe(1)
  })

  it('[AC-SNS02-030][AC-SNS02-032] 게시가 실패하면 입력이 남고 다시 게시해도 같은 Idempotency-Key로 보낸다', async () => {
    let fail = true
    server.use(http.post(SNS_POSTS_URL, () => (fail ? new HttpResponse(null, { status: 500 }) : undefined)))
    const user = userEvent.setup()
    const router = renderAt('/sns/posts/new')
    await user.type(await screen.findByLabelText('캡션'), '다시 올릴 글')
    await attach(user, 'a.jpg')
    await waitFor(() => expect(publishButton()).toBeEnabled())

    await user.click(publishButton())
    expect(await screen.findByText('게시하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(screen.getByLabelText('캡션')).toHaveValue('다시 올릴 글')
    expect(tiles()).toHaveLength(1)

    fail = false
    await user.click(publishButton())
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sns\/posts\/01K/))
    expect(postRequests).toHaveLength(2)
    expect(postRequests[0]!.key).toBe(postRequests[1]!.key)
  })

  it('[AC-SNS02-031] 업로드가 실패한 사진이 있으면 게시 버튼이 꺼지고 그 사진에 다시 시도와 빼기가 보인다', async () => {
    let failPut = true
    server.use(
      http.put('https://fake-s3.local/*', () => (failPut ? new HttpResponse(null, { status: 500 }) : undefined)),
    )
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    await user.type(await screen.findByLabelText('캡션'), '사진 실패')

    await attach(user, 'a.jpg')
    expect(await screen.findByText('올리지 못했어요')).toBeInTheDocument()
    expect(publishButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: '사진 1 빼기' })).toBeInTheDocument()

    failPut = false
    await user.click(screen.getByRole('button', { name: '사진 1 다시 시도' }))
    await waitFor(() => expect(publishButton()).toBeEnabled())
    expect(screen.queryByText('올리지 못했어요')).not.toBeInTheDocument()
  })

  it('발급 단계의 거부(100004)도 그 사진의 업로드 실패로 보고 빼면 게시할 수 있다', async () => {
    server.use(
      http.post(PRESIGNED_URL, () => HttpResponse.json({ errorCode: 100004, message: '' }, { status: 400 })),
    )
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    await user.type(await screen.findByLabelText('캡션'), '큰 사진')

    await attach(user, 'big.jpg')
    expect(await screen.findByText('올리지 못했어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '사진 1 빼기' }))
    expect(publishButton()).toBeEnabled()
  })

  it('tmp 원본이 지워져 404 100001이면 첨부를 모두 다시 올리고 같은 키로 다시 게시한다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sns/posts/new')
    await screen.findByLabelText('캡션')
    await attach(user, 'a.jpg', 'bb.jpg')
    await waitFor(() => expect(publishButton()).toBeEnabled())
    expect(presignCount).toBe(2)

    expireSnsUploads()
    await user.click(publishButton())

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sns\/posts\/01K/))
    expect(presignCount).toBe(4)
    expect(postRequests).toHaveLength(2)
    expect(postRequests[0]!.key).toBe(postRequests[1]!.key)
    expect(postRequests[1]!.body['photoKeys']).not.toEqual(postRequests[0]!.body['photoKeys'])
    expect(await screen.findAllByRole('img', { name: /^사진 \d\/2$/ })).toHaveLength(2)
  })

  it('[AC-SNS02-033] 금지어 비율이 기준을 넘으면 거부되고 입력이 남는다. 기준 이하면 가려 보여준다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    const caption = await screen.findByLabelText('캡션')

    await user.type(caption, '욕설 욕설 욕설')
    await user.click(publishButton())
    expect(await screen.findByText('쓸 수 없는 단어가 많아 올릴 수 없어요. 내용을 고쳐 주세요')).toBeInTheDocument()
    expect(caption).toHaveValue('욕설 욕설 욕설')

    await user.clear(caption)
    await user.type(caption, '오늘 산책 중에 욕설 들었어요')
    await user.click(publishButton())
    expect(await screen.findByText('오늘 산책 중에 ** 들었어요')).toBeInTheDocument()
  })

  it('빈도 제한(429 90006)이면 잠시 후 다시 시도해 달라고 안내한다', async () => {
    server.use(
      http.post(SNS_POSTS_URL, () => HttpResponse.json({ errorCode: 90006, message: '' }, { status: 429 })),
    )
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    await user.type(await screen.findByLabelText('캡션'), '빠르게')
    await user.click(publishButton())
    expect(await screen.findByText('잠시 후 다시 시도해 주세요')).toBeInTheDocument()
  })

  it('이용 제한 계정이 게시하면 이용 제한 안내가 나오고 입력이 남는다(403 20013)', async () => {
    seedSns({ restricted: [SNS_ME] })
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    await user.type(await screen.findByLabelText('캡션'), '제한된 계정의 글')
    await user.click(publishButton())
    expect(await screen.findByText('이용이 제한된 계정이라 이 기능을 사용할 수 없어요')).toBeInTheDocument()
    expect(screen.getByLabelText('캡션')).toHaveValue('제한된 계정의 글')
  })

  it('빈도 제한은 HTTP 429로 본다. develop의 90006(404 경로 없음)은 일반 실패 안내다', async () => {
    server.use(
      http.post(SNS_POSTS_URL, () => HttpResponse.json({ errorCode: 90006, message: '' }, { status: 404 })),
    )
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    await user.type(await screen.findByLabelText('캡션'), '빠르게')
    await user.click(publishButton())
    expect(await screen.findByText('게시하지 못했어요. 다시 시도해 주세요')).toBeInTheDocument()
    expect(screen.queryByText('잠시 후 다시 시도해 주세요')).not.toBeInTheDocument()
  })

  it('[AC-SNS02-014] 캡션에 #단어를 쓰면 해시태그 추가 안내가 나오고 게시해도 태그로 등록되지 않는다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    const caption = await screen.findByLabelText('캡션')

    await user.type(caption, '오늘 #')
    expect(screen.queryByText(/캡션에 쓴 #단어는 해시태그로 등록되지 않아요/)).not.toBeInTheDocument()
    await user.type(caption, '산책')
    expect(screen.getByText(/캡션에 쓴 #단어는 해시태그로 등록되지 않아요/)).toBeInTheDocument()

    await user.click(publishButton())
    expect(await screen.findByText('오늘 #산책')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '해시태그' })).not.toBeInTheDocument()
    expect(postRequests[0]!.body['hashtags']).toBeUndefined()
  })
})

describe('/sns/posts/new 영상', () => {
  const attachVideo = async (user: ReturnType<typeof userEvent.setup>, file: File) =>
    user.upload(screen.getByLabelText('영상 파일'), file)

  it('영상을 올려 게시하면 키, 썸네일 키, 길이를 함께 보내고 상세에서 재생한다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sns/posts/new')
    await screen.findByLabelText('캡션')

    await attachVideo(user, video('walk.mp4'))
    expect(await screen.findByText('0:43')).toBeInTheDocument()
    await waitFor(() => expect(publishButton()).toBeEnabled())
    await user.click(publishButton())

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sns\/posts\/01K/))
    const body = postRequests[0]!.body as { video: { key: string; thumbnailKey: string; durationMs: number } }
    expect(body.video.key).toMatch(/^tmp\/1\/sns\/posts\/videos\//)
    expect(body.video.thumbnailKey).toMatch(/^tmp\/1\/sns\/posts\/images\//)
    expect(body.video.durationMs).toBe(42_500)
    expect(body).not.toHaveProperty('photoKeys')
    expect(await screen.findByLabelText('영상')).toHaveAttribute('poster', expect.stringContaining('sns/posts/images/'))
  })

  it('[AC-SNS02-010] 60초나 100MB를 넘는 영상과 두 번째 영상은 붙이지 않고 안내한다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    await screen.findByLabelText('캡션')

    await attachVideo(user, video('long.mp4'))
    expect(await screen.findByText('60초 이하 영상만 올릴 수 있어요')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('list', { name: '첨부' })).not.toBeInTheDocument())

    const huge = video('huge.mp4')
    Object.defineProperty(huge, 'size', { value: 100 * 1024 * 1024 + 1 })
    await attachVideo(user, huge)
    expect(await screen.findByText('100MB 이하 영상만 올릴 수 있어요')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '첨부' })).not.toBeInTheDocument()

    await attachVideo(user, video('first.mp4'))
    await screen.findByText('0:43')
    await attachVideo(user, video('second.mp4'))
    expect(await screen.findByText('영상은 1개만 올릴 수 있어요. 바꾸려면 지금 영상을 먼저 빼 주세요')).toBeInTheDocument()
    expect(tiles()).toHaveLength(1)
  })

  it('[AC-SNS02-007] 사진과 영상을 함께 고르면 붙이지 않고 안내한다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    await screen.findByLabelText('캡션')

    await attach(user, 'a.jpg')
    await attachVideo(user, video('walk.mp4'))
    expect(await screen.findByText('사진과 영상은 함께 올릴 수 없어요')).toBeInTheDocument()
    expect(tiles().map(img => img.getAttribute('alt'))).toEqual(['사진 1'])

    await user.click(screen.getByRole('button', { name: '사진 1 빼기' }))
    await attachVideo(user, video('walk.mp4'))
    await screen.findByText('0:43')
    await attach(user, 'b.jpg')
    expect(await screen.findAllByText('사진과 영상은 함께 올릴 수 없어요')).not.toHaveLength(0)
    expect(tiles().map(img => img.getAttribute('alt'))).toEqual(['영상'])
    expect(screen.queryByRole('button', { name: '사진 추가' })).not.toBeInTheDocument()
  })

  it('이 기기에서 디코딩하지 못하는 영상은 다시 시도 없이 안내와 빼기만 보여준다', async () => {
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    await user.type(await screen.findByLabelText('캡션'), '영상 글')

    await attachVideo(user, video('broken.mov'))
    expect(await screen.findByText('이 기기에서 올릴 수 없는 영상 형식이에요')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '영상 다시 시도' })).not.toBeInTheDocument()
    expect(publishButton()).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '영상 빼기' }))
    expect(publishButton()).toBeEnabled()
  })

  it('썸네일을 만들지 못하면 다시 시도와 빼기를 보여주고 다시 시도하면 올린다', async () => {
    thumbnailFailures.add('nothumb.mp4')
    const user = userEvent.setup()
    renderAt('/sns/posts/new')
    await screen.findByLabelText('캡션')

    await attachVideo(user, video('nothumb.mp4'))
    expect(await screen.findByText('올리지 못했어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '영상 빼기' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '영상 다시 시도' }))
    await waitFor(() => expect(publishButton()).toBeEnabled())
  })

  it('[AC-SNS02-031] tmp 원본이 지워져 다시 올리다 영상이 실패하면 다시 시도는 지워진 키 대신 영상을 새로 올려 게시한다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sns/posts/new')
    await screen.findByLabelText('캡션')
    await attachVideo(user, video('walk.mp4'))
    await waitFor(() => expect(publishButton()).toBeEnabled())

    expireSnsUploads()
    server.use(
      http.put('https://fake-s3.local/tmp/1/sns/posts/videos/*', () => new HttpResponse(null, { status: 500 }), {
        once: true,
      }),
    )
    await user.click(publishButton())
    expect(await screen.findByText('올리지 못했어요')).toBeInTheDocument()
    const presigned = presignCount

    await user.click(screen.getByRole('button', { name: '영상 다시 시도' }))
    await waitFor(() => expect(publishButton()).toBeEnabled())
    expect(presignCount).toBe(presigned + 1)
    await user.click(publishButton())

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sns\/posts\/01K/))
    const videoKey = (request: PostRequest) => (request.body as { video: { key: string } }).video.key
    expect(postRequests).toHaveLength(2)
    expect(videoKey(postRequests[1]!)).not.toBe(videoKey(postRequests[0]!))
  })

  it.each([
    ['영상을 빼면', (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: '영상 빼기' }))],
    [
      '작성 화면을 닫으면',
      async (user: ReturnType<typeof userEvent.setup>) => {
        await user.click(screen.getByRole('button', { name: '닫기' }))
        await user.click(await screen.findByRole('button', { name: '나가기' }))
      },
    ],
  ])('썸네일을 올리는 중에 %s 그 PUT을 끊고 영상 발급도 받지 않는다', async (_, stop) => {
    let release = () => {}
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.put('https://fake-s3.local/*', async () => {
        await held
        return undefined
      }),
    )
    const purposes: string[] = []
    let puts = 0
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'PUT') puts += 1
      if (request.url.endsWith('/files/presigned-url')) {
        purposes.push(((await request.clone().json()) as { purpose: string }).purpose)
      }
    })
    // jsdom과 MSW는 끊은 XHR에 abort 이벤트를 주지 않아 abort 호출로 확인한다.
    const abort = vi.spyOn(XMLHttpRequest.prototype, 'abort')
    try {
      const user = userEvent.setup()
      renderAt('/sns/posts/new')
      await screen.findByLabelText('캡션')
      await attachVideo(user, video('walk.mp4'))
      await waitFor(() => expect(puts).toBe(1))

      await stop(user)
      await waitFor(() => expect(abort).toHaveBeenCalled())
      release()
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(purposes).toEqual(['SNS_POST_IMAGE'])
    } finally {
      abort.mockRestore()
    }
  })
})

describe('/sns/posts/new 닫기와 비로그인', () => {
  it('[AC-SNS02-032] 작성 중 닫으면 취소 확인을 거치고 계속 쓰면 입력이 남는다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sns/posts/new')
    await user.type(await screen.findByLabelText('캡션'), '쓰던 글')

    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(await screen.findByText('작성을 취소할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '계속 쓰기' }))
    expect(screen.getByLabelText('캡션')).toHaveValue('쓰던 글')

    await user.click(screen.getByRole('button', { name: '닫기' }))
    await user.click(await screen.findByRole('button', { name: '나가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns'))
  })

  // 브라우저 뒤로 가기(popstate)도 같은 블로커를 지난다. 메모리 히스토리는 뒤로 가기에 블로커를 돌리지 않아
  // 여기서는 다른 화면으로의 이동으로 블로커를 확인한다.
  it('[AC-SNS02-032] 닫기 버튼이 아닌 이동도 같은 취소 확인을 거친다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sns/posts/new')
    await user.type(await screen.findByLabelText('캡션'), '쓰던 글')

    void router.navigate({ to: '/market' })
    await user.click(await screen.findByRole('button', { name: '계속 쓰기' }))
    expect(router.state.location.pathname).toBe('/sns/posts/new')
    expect(screen.getByLabelText('캡션')).toHaveValue('쓰던 글')

    void router.navigate({ to: '/market' })
    await user.click(await screen.findByRole('button', { name: '나가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/market'))
  })

  it('게시 중에는 닫기와 캡션 고치기를 막는다', async () => {
    let release = () => {}
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.post(SNS_POSTS_URL, async () => {
        await held
        return undefined
      }),
    )
    const user = userEvent.setup()
    const router = renderAt('/sns/posts/new')
    await user.type(await screen.findByLabelText('캡션'), '보내는 중')
    await user.click(publishButton())

    expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled()
    expect(screen.getByLabelText('캡션')).toHaveAttribute('readonly')
    // 막힌 이동의 약속은 끝나지 않아 기다리지 않고 한 틱 뒤에 본다.
    void router.navigate({ to: '/market' })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.queryByText('작성을 취소할까요?')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/sns/posts/new')

    release()
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sns\/posts\/01K/))
  })

  it('게시 중에는 해시태그 칩도 뺄 수 없다', async () => {
    let release = () => {}
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.post(SNS_POSTS_URL, async () => {
        await held
        return undefined
      }),
    )
    const user = userEvent.setup()
    const router = renderAt('/sns/posts/new')
    await user.type(await screen.findByLabelText('캡션'), '태그 단 글')
    await user.click(screen.getByRole('button', { name: '해시태그 추가' }))
    await user.type(await screen.findByRole('textbox', { name: '해시태그 검색' }), '산책')
    await user.click(await screen.findByRole('button', { name: '#산책 게시글 52 추가' }))
    await user.click(screen.getByRole('button', { name: '완료 1' }))
    await user.click(publishButton())

    expect(screen.getByRole('button', { name: '#산책 빼기' })).toBeDisabled()
    release()
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sns\/posts\/01K/))
    expect(postRequests[0]!.body['hashtags']).toEqual(['산책'])
  })

  it('아무것도 쓰지 않았으면 확인 없이 닫는다', async () => {
    const user = userEvent.setup()
    const router = renderAt('/sns/posts/new')

    await user.click(await screen.findByRole('button', { name: '닫기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns'))
  })

  it('[AC-SNS02-001] 비로그인이 주소로 바로 들어오면 요청 없이 로그인 안내 시트를 열고 닫으면 이전 화면으로 간다', async () => {
    logout()
    seedSns({ viewer: null })
    const user = userEvent.setup()
    const router = renderAt('/sns/posts/new')

    expect(await screen.findByText(/글 작성은 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()
    expect(screen.getByText(/로그인하면 보던 화면으로 돌아와 이어서 할 수 있어요/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '둘러보기 계속하기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns'))
    expect(postRequests).toHaveLength(0)
  })
})
