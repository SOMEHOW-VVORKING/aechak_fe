import { test, expect, type Page, type Route } from '@playwright/test'
import type { SnsHashtagSearchResult, SnsPostDetailResult } from '@aechak/api'

// SNS-02 게시물 상세(b7-st-2), 작성(b7-st-3), 해시태그 모달(3-B), 수정과 삭제 E2E.
// 실백엔드 없이 page.route 스텁으로 contracts/sns.yaml을 재현한다(교차 출처 8080 + withCredentials라 정확한 origin과
// Allow-Credentials, OPTIONS 방어 필수). jsdom에서는 볼 수 없는 실제 브라우저 동작, 즉 사진을 캔버스로 다시 인코딩한
// JPEG의 크기와 발급 요청의 contentLength가 같은지, 긴 변이 2,048px 이하인지, 디코딩하지 못하는 영상의 error
// 이벤트를 여기서 확인한다. 작성 화면은 경로로 바로 연다.
// 각 상태를 PR 첨부용으로 test-results/pr-c(gitignore)에 찍는다.

const ORIGIN = 'http://localhost:5175'
const API = 'http://localhost:8080/api/v1'
const BUCKET = 'https://e2e-bucket.s3.local'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-c'

async function shot(page: Page, name: string) {
  await page.addStyleTag({
    content:
      '.tsqd-parent-container,.tsqd-open-btn-container,[aria-label*="query devtools" i],[aria-label*="Tanstack" i]{display:none!important}',
  })
  await page.screenshot({ path: `${SHOTS}/${name}.png`, animations: 'disabled' })
}

function fulfill(route: Route, status: number, json?: unknown) {
  if (route.request().method() === 'OPTIONS') {
    return route.fulfill({
      status: 204,
      headers: {
        ...CORS,
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE',
        'Access-Control-Allow-Headers': '*',
      },
    })
  }
  return json === undefined
    ? route.fulfill({ status, headers: CORS })
    : route.fulfill({ status, headers: CORS, json })
}

function solid(color: string, width = 600, height = 600) {
  return `data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22${width}%22 height=%22${height}%22%3E%3Crect width=%22${width}%22 height=%22${height}%22 fill=%22%23${color}%22/%3E%3C/svg%3E`
}

const POST_ID = '01K8E2E0SNSPOST0000000001'
const NEW_POST_ID = '01K8E2E0SNSPOST000000NEW1'
const AUTHOR_ID = '01K8E2E0SNSUSER000000BORI'

// 생성 타입을 쓴다. e2e는 tsc include 밖이라 로컬 인터페이스면 계약 변경을 못 잡는다.
const POST: SnsPostDetailResult = {
  publicId: POST_ID,
  author: { publicId: AUTHOR_ID, nickname: '보리언니', profileImageUrl: solid('E8B04B', 80, 80) },
  pet: { breedLabel: '골든리트리버', birthYearMonth: '2021-01' },
  caption: '오늘 보리랑 한강 산책 다녀왔어요\n바람이 좋아서 오래 걸었어요',
  hashtags: ['한강산책', '골든리트리버'],
  photoUrls: [solid('E8B04B'), solid('7BA7D9')],
  video: null,
  likeCount: 128,
  commentCount: 12,
  repostCount: 3,
  edited: false,
  createdAt: '2026-10-22T14:14:00',
  isMine: false,
  following: false,
  mutedByMe: false,
  reposted: false,
  saved: false,
  liked: false,
}

const MY_POST: SnsPostDetailResult = {
  ...POST,
  publicId: NEW_POST_ID,
  author: { publicId: '01K8E2E0SNSUSER00000000ME', nickname: '콩이집사', profileImageUrl: null },
  pet: { breedLabel: '말티즈', birthYearMonth: null },
  caption: '콩이 첫 산책',
  hashtags: ['산책', '댕댕'],
  photoUrls: [solid('A3C585'), solid('7BA7D9')],
  likeCount: 0,
  commentCount: 0,
  repostCount: 0,
  isMine: true,
}

const HASHTAGS: Record<string, SnsHashtagSearchResult> = {
  '': {
    query: '',
    status: 'EMPTY',
    exact: null,
    items: [
      { name: '댕댕이', postCount: 82_000 },
      { name: '산책스타그램', postCount: 124_500 },
      { name: '산책', postCount: 9_210 },
    ],
  },
  댕: {
    query: '댕',
    status: 'NEW',
    exact: null,
    items: [
      { name: '댕댕이', postCount: 1200 },
      { name: '댕댕', postCount: 300 },
      { name: '댕청미', postCount: 15 },
    ],
  },
  산책: { query: '산책', status: 'EXISTS', exact: { name: '산책', postCount: 9_210 }, items: [] },
  '산 책': { query: '산 책', status: 'INVALID', exact: null, items: [] },
}

interface StubOptions {
  member?: boolean
  /** 상세 응답. 숫자면 그 코드의 오류 */
  post?: SnsPostDetailResult | 130400 | 130001
}

interface Calls {
  presigns: { purpose: string; contentType: string; contentLength: number }[]
  puts: { url: string; contentType: string | undefined; bytes: Buffer }[]
  creates: { key: string | undefined; body: Record<string, unknown> }[]
  patches: Record<string, unknown>[]
  deletes: number
}

let unexpected: string[] = []
test.afterEach(() => expect(unexpected).toEqual([]))

async function stubSns(page: Page, opts: StubOptions = {}) {
  const member = opts.member ?? true
  let post = opts.post ?? POST
  const calls: Calls = { presigns: [], puts: [], creates: [], patches: [], deletes: 0 }
  unexpected = []

  await page.route(`${API}/**`, route => {
    unexpected.push(`${route.request().method()} ${route.request().url()}`)
    return fulfill(route, 500, { errorCode: 90000, message: '스텁 없음' })
  })
  await page.route(`${API}/auth/web/refresh`, route =>
    member
      ? fulfill(route, 200, { data: { accessToken: 'e2e-access', tokenType: 'Bearer', expiresIn: 1800 } })
      : fulfill(route, 401, { errorCode: 20002, message: '인증이 필요합니다.' }),
  )

  await page.route(`${API}/sns/posts/*`, route => {
    const method = route.request().method()
    if (method === 'OPTIONS') return fulfill(route, 204)
    if (method === 'PATCH') {
      const body = route.request().postDataJSON() as { caption: string | null; hashtags: string[] }
      calls.patches.push(body)
      if (typeof post === 'object') post = { ...post, caption: body.caption, hashtags: body.hashtags, edited: true }
      return fulfill(route, 204)
    }
    if (method === 'DELETE') {
      calls.deletes += 1
      post = 130400
      return fulfill(route, 204)
    }
    if (post === 130400) return fulfill(route, 404, { errorCode: 130400, message: '볼 수 없는 게시물입니다.' })
    if (post === 130001) return fulfill(route, 403, { errorCode: 130001, message: '차단한 계정입니다.' })
    return fulfill(route, 200, { data: post })
  })

  await page.route(`${API}/sns/posts/*/comments*`, route => fulfill(route, 200, { data: { items: [], nextCursor: null, hasNext: false } }))
  // 삭제 뒤 돌아가는 하단 SNS 탭이 피드를 부른다.
  await page.route(`${API}/sns/feeds/*`, route => fulfill(route, 200, { data: { items: [], nextCursor: null, hasNext: false } }))

  await page.route(`${API}/sns/posts`, route => {
    if (route.request().method() === 'OPTIONS') return fulfill(route, 204)
    calls.creates.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postDataJSON() as Record<string, unknown>,
    })
    post = MY_POST
    return fulfill(route, 201, { data: { publicId: NEW_POST_ID } })
  })

  await page.route(`${API}/sns/hashtags*`, route => {
    const query = new URL(route.request().url()).searchParams.get('query') ?? ''
    const result = HASHTAGS[query] ?? { query, status: 'NEW', exact: null, items: [] }
    return fulfill(route, 200, { data: result })
  })

  await page.route(`${API}/files/presigned-url`, route => {
    if (route.request().method() === 'OPTIONS') return fulfill(route, 204)
    const body = route.request().postDataJSON() as Calls['presigns'][number]
    calls.presigns.push(body)
    const folder = body.purpose === 'SNS_POST_VIDEO' ? 'videos' : 'images'
    const key = `tmp/42/sns/posts/${folder}/e2e-${calls.presigns.length}.jpg`
    return fulfill(route, 200, { data: { url: `${BUCKET}/${key}?X-Amz-Signature=e2e`, key } })
  })

  // presigned PUT은 S3 직행이다. 자격 증명 없이 보내므로 Allow-Credentials는 두지 않는다.
  await page.route(`${BUCKET}/**`, route => {
    const headers = { 'Access-Control-Allow-Origin': ORIGIN }
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: { ...headers, 'Access-Control-Allow-Methods': 'PUT', 'Access-Control-Allow-Headers': 'Content-Type' },
      })
    }
    calls.puts.push({
      url: route.request().url(),
      contentType: route.request().headers()['content-type'],
      bytes: route.request().postDataBuffer() ?? Buffer.alloc(0),
    })
    return route.fulfill({ status: 200, headers })
  })
  return calls
}

/** JPEG SOF 마커에서 가로, 세로를 읽는다 */
function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  for (let i = 2; i < bytes.length - 9; i += 1) {
    if (bytes[i] === 0xff && (bytes[i + 1] === 0xc0 || bytes[i + 1] === 0xc2)) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) }
    }
  }
  return null
}

/** 브라우저 캔버스로 큰 PNG를 만든다(긴 변 3,000px). 다시 인코딩하면 2,048px로 줄어야 한다. */
async function bigPng(page: Page, background = '#e8b04b'): Promise<Buffer> {
  const base64 = await page.evaluate(async background => {
    const canvas = document.createElement('canvas')
    canvas.width = 3000
    canvas.height = 1500
    const context = canvas.getContext('2d')!
    context.fillStyle = background
    context.fillRect(0, 0, 3000, 1500)
    context.fillStyle = '#2a8240'
    context.fillRect(200, 200, 1200, 800)
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  }, background)
  return Buffer.from(base64, 'base64')
}

/** 이 브라우저가 재생할 수 있는 1초 남짓한 세로 WebM을 캔버스로 녹화한다. */
async function webmClip(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 360
    canvas.height = 640
    const context = canvas.getContext('2d')!
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = event => chunks.push(event.data)
    const stopped = new Promise(resolve => (recorder.onstop = resolve))
    recorder.start()
    let frame = 0
    const timer = setInterval(() => {
      context.fillStyle = frame++ % 2 ? '#7ba7d9' : '#5b8db8'
      context.fillRect(0, 0, 360, 640)
    }, 33)
    await new Promise(resolve => setTimeout(resolve, 1200))
    recorder.stop()
    clearInterval(timer)
    await stopped
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  })
  return Buffer.from(base64, 'base64')
}

test('[AC-SNS02-E2E-001] 비로그인으로 공유 링크를 열면 사진, 캡션, 해시태그, 펫 태그, 세 수를 보고 팔로우는 로그인 안내다', async ({
  page,
}) => {
  await stubSns(page, { member: false })
  await page.goto(`/sns/posts/${POST_ID}`)

  await expect(page.getByText('오늘 보리랑 한강 산책 다녀왔어요')).toBeVisible()
  await expect(page.getByRole('img', { name: /^사진/ })).toHaveCount(2)
  await expect(page.getByRole('list', { name: '해시태그' }).getByRole('listitem')).toHaveText([
    '#한강산책',
    '#골든리트리버',
  ])
  // 게시일(2026-10-22) 기준 나이다.
  await expect(page.getByText('골든리트리버 / 5살')).toBeVisible()
  await expect(page.getByText('2026.10.22 오후 2:14')).toBeVisible()
  // 리포스트 수는 버튼에 함께 그리고 저장 버튼은 수 없이 아이콘만 그린다(A23).
  await expect(page.getByRole('button', { name: /^리포스트/ })).toHaveAccessibleName('리포스트 3')
  await expect(page.getByRole('button', { name: '저장' })).toHaveText('')
  await shot(page, 'sns-post-01-detail-guest')

  await page.getByRole('button', { name: '팔로우', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('팔로우는 로그인한 회원만 이용할 수 있어요.')).toBeVisible()
})

test('[AC-SNS02-E2E-002] 삭제된 게시물은 삭제된 게시물 안내를 보여준다', async ({ page }) => {
  await stubSns(page, { post: 130400 })
  await page.goto(`/sns/posts/${POST_ID}`)
  await expect(page.getByText('삭제된 게시물이에요')).toBeVisible()
  await expect(page.getByRole('button', { name: '더보기' })).toHaveCount(0)
  await shot(page, 'sns-post-02-deleted')
})

test('[AC-SNS02-E2E-007] 내가 차단한 작성자의 게시물은 차단 관리와 프로필 이동을 보여준다', async ({ page }) => {
  await stubSns(page, { post: 130001 })
  await page.goto(`/sns/posts/${POST_ID}?author=${AUTHOR_ID}`)
  await expect(page.getByText('차단한 계정의 게시물이에요')).toBeVisible()
  await expect(page.getByRole('button', { name: '차단 관리' })).toBeVisible()
  await expect(page.getByRole('button', { name: '프로필 보기' })).toBeVisible()
  await shot(page, 'sns-post-03-blocked')
})

test('[AC-SNS02-E2E-003] 사진은 긴 변 2,048px JPEG로 다시 인코딩해 그 크기로 발급받고 같은 바이트를 올린 뒤 게시한다', async ({
  page,
}) => {
  const calls = await stubSns(page)
  await page.goto('/sns/posts/new')
  await page.getByLabel('캡션').fill('콩이 첫 산책')
  await page.getByLabel('사진 파일').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: await bigPng(page) })

  await expect(page.getByRole('img', { name: '사진 1' })).toBeVisible()
  await expect(page.getByRole('button', { name: '게시' })).toBeEnabled()
  expect(calls.presigns).toHaveLength(1)
  expect(calls.presigns[0]).toMatchObject({ purpose: 'SNS_POST_IMAGE', contentType: 'image/jpeg' })
  // 서버가 길이를 서명에 넣는다. 발급 요청의 길이와 PUT 본문 길이가 다르면 S3가 403으로 거부한다.
  expect(calls.puts[0]!.bytes.length).toBe(calls.presigns[0]!.contentLength)
  expect(calls.puts[0]!.contentType).toBe('image/jpeg')
  expect(jpegSize(calls.puts[0]!.bytes)).toEqual({ width: 2048, height: 1024 })

  // 두 번째 사진은 첫 사진 뒤에 붙고 게시 본문에 고른 순서대로 실린다.
  await page
    .getByLabel('사진 파일')
    .setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: await bigPng(page, '#7ba7d9') })
  await expect(page.getByRole('img', { name: '사진 2' })).toBeVisible()
  await expect(page.getByRole('button', { name: '게시' })).toBeEnabled()

  await page.getByRole('button', { name: '해시태그 추가' }).click()
  const search = page.getByRole('textbox', { name: '해시태그 검색' })
  await search.fill('산책')
  await page.getByRole('button', { name: '#산책 게시글 9,210 추가' }).click()
  await search.fill('댕')
  await page.getByRole('button', { name: '#댕댕 게시글 300 추가' }).click()
  await page.getByRole('button', { name: '완료 2' }).click()
  await shot(page, 'sns-post-04-compose')

  await page.getByRole('button', { name: '게시' }).click()
  await expect(page).toHaveURL(`/sns/posts/${NEW_POST_ID}`)
  await expect(page.getByText('콩이 첫 산책')).toBeVisible()
  expect(calls.creates).toHaveLength(1)
  expect(calls.creates[0]!.key).toMatch(/^[0-9a-f-]{36}$/)
  expect(calls.creates[0]!.body).toEqual({
    caption: '콩이 첫 산책',
    photoKeys: ['tmp/42/sns/posts/images/e2e-1.jpg', 'tmp/42/sns/posts/images/e2e-2.jpg'],
    hashtags: ['산책', '댕댕'],
  })
  await shot(page, 'sns-post-05-published')
})

test('[AC-SNS02-E2E-004] 해시태그 모달은 추천, 새 태그, 정확한 태그, 쓸 수 없는 글자 안내를 그린다', async ({ page }) => {
  await stubSns(page)
  await page.goto('/sns/posts/new')
  await page.getByRole('button', { name: '해시태그 추가' }).click()

  const search = page.getByRole('textbox', { name: '해시태그 검색' })
  await expect(search).toBeFocused()
  await expect(page.getByRole('button', { name: '#산책스타그램 게시글 12.4만 추가' })).toBeVisible()
  await shot(page, 'sns-post-06-hashtag-empty')

  await search.fill('댕')
  await expect(page.getByRole('button', { name: '#댕 새 해시태그 만들기 추가' })).toBeVisible()
  await expect(page.getByRole('button', { name: '#댕댕이 게시글 1,200 추가' })).toBeVisible()
  await page.getByRole('button', { name: '#댕댕 게시글 300 추가' }).click()
  await shot(page, 'sns-post-07-hashtag-new')

  await search.fill('산 책')
  await expect(page.getByText('한글, 영문, 숫자, 밑줄만 쓸 수 있어요')).toBeVisible()
  await expect(page.getByRole('button', { name: /새 해시태그 만들기/ })).toHaveCount(0)
  await shot(page, 'sns-post-08-hashtag-invalid')
})

test('[AC-SNS02-E2E-005] 이 브라우저가 디코딩하지 못하는 영상은 다시 시도 없이 안내와 빼기만 보여준다', async ({ page }) => {
  const calls = await stubSns(page)
  await page.goto('/sns/posts/new')
  await page.getByLabel('영상 파일').setInputFiles({
    name: 'broken.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('not a real video'),
  })

  await expect(page.getByText('이 기기에서 올릴 수 없는 영상 형식이에요')).toBeVisible()
  await expect(page.getByRole('button', { name: '영상 다시 시도' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '영상 빼기' })).toBeVisible()
  // 판정은 업로드 전에 한다. 쓸모없는 전송이 없다.
  expect(calls.presigns).toHaveLength(0)
  await shot(page, 'sns-post-09-video-unsupported')
})

test('[AC-SNS02-E2E-006] 내 게시물을 수정하면 수정됨이 붙고 삭제는 확인 뒤 이전 화면으로 간다', async ({ page }) => {
  const calls = await stubSns(page, { post: MY_POST })
  await page.goto('/sns')
  await page.goto(`/sns/posts/${NEW_POST_ID}`)

  await page.getByRole('button', { name: '더보기' }).click()
  await expect(page.getByRole('dialog').getByRole('button')).toHaveText(['링크 복사', '수정', '삭제'])
  await page.getByRole('dialog').getByRole('button', { name: '수정' }).click()

  await expect(page.getByText('사진과 영상은 바꿀 수 없어요.')).toBeVisible()
  await page.getByLabel('캡션').fill('콩이 첫 산책 (수정)')
  await shot(page, 'sns-post-10-edit')
  await page.getByRole('button', { name: '저장' }).click()

  await expect(page.getByText('콩이 첫 산책 (수정)')).toBeVisible()
  await expect(page.getByText('수정됨')).toBeVisible()
  expect(calls.patches).toEqual([{ caption: '콩이 첫 산책 (수정)', hashtags: ['산책', '댕댕'] }])

  await page.getByRole('button', { name: '더보기' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click()
  const confirm = page.getByRole('dialog', { name: '게시물을 삭제할까요?' })
  await shot(page, 'sns-post-11-delete-confirm')
  await confirm.getByRole('button', { name: '삭제' }).click()
  await expect(page).toHaveURL('/sns')
  expect(calls.deletes).toBe(1)
})

test('[AC-SNS02-E2E-008] 영상 게시물 상세는 사진 자리 없이 썸네일을 포스터로 한 영상을 서버가 준 주소에서 불러온다', async ({
  page,
}) => {
  // 세로로 찍은 영상과 썸네일이다. 정사각 자리에 잘리지 않고 양옆이 검게 남는다. 실제 원본은 MP4나 MOV지만
  // 픽스처 파일 없이 브라우저에서 만들 수 있는 WebM으로 대신한다.
  const thumbnailUrl = solid('7BA7D9', 720, 1280)
  const videoUrl = `${BUCKET}/sns/posts/videos/e2e.webm`
  await stubSns(page, {
    post: {
      ...POST,
      caption: '보리 첫 수영 영상이에요',
      hashtags: ['댕댕이수영', '골든리트리버'],
      photoUrls: [],
      video: { url: videoUrl, thumbnailUrl, durationMs: 42_000 },
    },
  })
  const clip = await webmClip(page)
  await page.route(videoUrl, route => route.fulfill({ status: 200, contentType: 'video/webm', body: clip }))
  await page.goto(`/sns/posts/${POST_ID}`)

  const video = page.getByLabel('영상')
  await expect(video).toHaveAttribute('poster', thumbnailUrl)
  // HAVE_METADATA(1) 이상이면 그 주소에서 영상을 읽었다.
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(1)
  await expect(page.getByRole('img', { name: /^사진/ })).toHaveCount(0)
  // 컨트롤의 불러오는 중 표시는 브라우저 내부 화면이라 DOM으로 기다릴 수 없어 영상 자리가 멈출 때까지 기다린다(캡처용).
  await expect.poll(async () => (await video.screenshot()).equals(await video.screenshot())).toBe(true)
  await shot(page, 'sns-post-12-video-detail')
})
