import { test, expect, type Page, type Route } from '@playwright/test'
import type { SnsCommentItemResult, SnsPostDetailResult } from '@aechak/api'

// SNS-04 댓글과 대댓글(b7-st-2 2-A, 2-D) E2E. 실백엔드 없이 page.route 스텁으로 contracts/sns.yaml SNS-04의 댓글 목록,
// 작성, 단건, 수정, 삭제 응답을 재현한다(교차 출처 8080 + withCredentials라 정확한 origin과 Allow-Credentials,
// OPTIONS 방어 필수). 각 상태를 PR 첨부용으로 test-results/pr-c(gitignore)에 찍는다.

const ORIGIN = 'http://localhost:5175'
const API = 'http://localhost:8080/api/v1'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-c'

// PR 캡처 직전 dev 전용 ReactQueryDevtools 플로팅 버튼을 숨긴다(실제 화면에는 없는 dev 오버레이).
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

// createdAt은 오프셋 없는 KST다. 상대 시각이 몇 분 전, 몇 시간 전으로 나오게 지금에서 뺀다.
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000 + 9 * 3_600_000).toISOString().slice(0, 19)

// 생성 타입을 쓴다. e2e는 tsc include 밖이라 로컬 인터페이스면 계약 변경을 못 잡는다.
const ME = { publicId: '01K8E2E0SNSUSER0000000ME0', nickname: '보리언니', profileImageUrl: null }
const COCO = { publicId: '01K8E2E0SNSUSER000000COCO', nickname: '코코집사', profileImageUrl: null }
const MONG = { publicId: '01K8E2E0SNSUSER000000MONG', nickname: '몽이아빠', profileImageUrl: null }
const CHOCO = { publicId: '01K8E2E0SNSUSER00000CHOCO', nickname: '초코맘', profileImageUrl: null }

const POST: SnsPostDetailResult = {
  publicId: '01K8E2E0SNSPOST0000000001',
  author: COCO,
  pet: { breedLabel: '말티즈', birthYearMonth: '2022-03' },
  caption: '코코 오늘 미용했어요',
  hashtags: ['말티즈'],
  photoUrls: [],
  video: null,
  likeCount: 8,
  commentCount: 4,
  repostCount: 0,
  edited: false,
  createdAt: ago(180),
  isMine: false,
  following: true,
  mutedByMe: false,
  reposted: false,
  saved: false,
  liked: false,
}
const EMPTY_POST: SnsPostDetailResult = {
  ...POST,
  publicId: '01K8E2E0SNSPOST0000000002',
  commentCount: 0,
}

const commentId = (n: number) => `01K8E2E0SNSCOMMENT0000${String(n).padStart(3, '0')}`

function item(
  n: number,
  author: SnsCommentItemResult['author'],
  fields: Partial<SnsCommentItemResult> = {},
) {
  const value: SnsCommentItemResult = {
    publicId: commentId(n),
    parentPublicId: null,
    status: 'ACTIVE',
    author,
    content: null,
    likeCount: 0,
    liked: false,
    edited: false,
    replyable: true,
    isMine: author?.publicId === ME.publicId,
    createdAt: ago(60),
    ...fields,
  }
  return value
}

// 몽이아빠 댓글과 코코집사 대댓글, 지운 최상위 댓글 아래 남은 초코맘 대댓글, 내 댓글.
const THREAD = (): SnsCommentItemResult[] => [
  item(1, MONG, { content: '코코 표정 너무 좋네요', createdAt: ago(150) }),
  item(2, COCO, {
    parentPublicId: commentId(1),
    content: '감사해요. 다음에 같이 산책해요',
    edited: true,
    createdAt: ago(120),
  }),
  item(3, null, { status: 'DELETED', replyable: false, createdAt: ago(100) }),
  item(4, CHOCO, {
    parentPublicId: commentId(3),
    content: '저도 궁금해요',
    replyable: false,
    createdAt: ago(90),
  }),
  item(5, ME, { content: '산책 코스 어디예요?', createdAt: ago(30) }),
]

// 스텁하지 않은 API 호출은 여기 모았다가 테스트 끝에 비어 있는지 본다.
let unexpected: string[] = []
test.afterEach(() => expect(unexpected).toEqual([]))

async function stubSns(page: Page, { member = true }: { member?: boolean } = {}) {
  const comments = new Map<string, SnsCommentItemResult[]>([
    [POST.publicId, THREAD()],
    [EMPTY_POST.publicId, []],
  ])
  const posts = new Map([POST, EMPTY_POST].map(p => [p.publicId, p]))
  const sent: Array<{ key: string | null; body: unknown }> = []
  unexpected = []

  // 먼저 등록한 라우트가 나중에 확인된다. 아래 개별 스텁에 걸리지 않은 호출만 여기로 온다.
  await page.route(`${API}/**`, route => {
    unexpected.push(`${route.request().method()} ${route.request().url()}`)
    return fulfill(route, 500, { errorCode: 90000, message: '스텁 없음' })
  })
  await page.route(`${API}/auth/web/refresh`, route =>
    member
      ? fulfill(route, 200, {
          data: { accessToken: 'e2e-access', tokenType: 'Bearer', expiresIn: 1800 },
        })
      : fulfill(route, 401, { errorCode: 20002, message: '인증이 필요합니다.' }),
  )
  await page.route(`${API}/sns/posts/*`, route => {
    const found = posts.get(new URL(route.request().url()).pathname.split('/').pop()!)!
    return fulfill(route, 200, { data: member ? found : { ...found, following: false } })
  })
  await page.route(`${API}/sns/posts/*/comments*`, async route => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return fulfill(route, 204)
    const postPublicId = new URL(request.url()).pathname.split('/').at(-2)!
    const list = comments.get(postPublicId)!
    if (request.method() === 'GET') {
      const items = member ? list : list.map(i => ({ ...i, isMine: false }))
      return fulfill(route, 200, { data: { items, nextCursor: null, hasNext: false } })
    }
    const body = request.postDataJSON() as { content: string; parentPublicId: string | null }
    sent.push({ key: request.headers()['idempotency-key'] ?? null, body })
    const created = item(100 + sent.length, ME, {
      content: body.content.trim(),
      parentPublicId: body.parentPublicId,
      createdAt: ago(0),
    })
    // 대댓글은 그 스레드 끝에 넣는다.
    const at = body.parentPublicId
      ? list.findLastIndex(
          i => i.publicId === body.parentPublicId || i.parentPublicId === body.parentPublicId,
        ) + 1
      : list.length
    list.splice(at, 0, created)
    posts.set(postPublicId, {
      ...posts.get(postPublicId)!,
      commentCount: posts.get(postPublicId)!.commentCount + 1,
    })
    return fulfill(route, 201, { data: created })
  })
  await page.route(`${API}/sns/comments/*`, route => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return fulfill(route, 204)
    const id = new URL(request.url()).pathname.split('/').pop()!
    const list = comments.get(POST.publicId)!
    const found = list.find(i => i.publicId === id)
    if (!found) return fulfill(route, 404, { errorCode: 130700, message: '볼 수 없는 댓글입니다.' })
    if (request.method() === 'GET') {
      const parent = found.parentPublicId
        ? list.find(i => i.publicId === found.parentPublicId)!
        : null
      return fulfill(route, 200, { data: { comment: found, parent } })
    }
    if (request.method() === 'DELETE') {
      list.splice(list.indexOf(found), 1)
      posts.set(POST.publicId, {
        ...posts.get(POST.publicId)!,
        commentCount: posts.get(POST.publicId)!.commentCount - 1,
      })
      return fulfill(route, 204)
    }
    return fulfill(route, 500, { errorCode: 90000, message: '스텁 없음' })
  })
  return { sent }
}

const comments = (page: Page) => page.getByRole('region', { name: '댓글' })

test('[AC-SNS04-E2E-010] 상세 아래 댓글이 오래된순 스레드로 나오고 지운 최상위 댓글은 안내 문구로 남는다', async ({
  page,
}) => {
  await stubSns(page)
  await page.goto(`/sns/posts/${POST.publicId}`)

  await expect(comments(page).getByText('코코 표정 너무 좋네요')).toBeVisible()
  await expect(comments(page).getByRole('heading')).toHaveText('답글 4')
  await expect(comments(page).getByText('삭제된 댓글이에요')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '댓글 입력' })).toHaveAttribute(
    'placeholder',
    '코코집사님에게 답글 남기기…',
  )
  await comments(page).scrollIntoViewIfNeeded()
  await shot(page, 'sns-comment-01-thread')
})

test('[AC-SNS04-E2E-011] 답글달기를 누르고 게시하면 그 스레드 끝에 붙고 입력이 빈다', async ({
  page,
}) => {
  const { sent } = await stubSns(page)
  await page.goto(`/sns/posts/${POST.publicId}`)

  await comments(page).getByRole('button', { name: '답글달기' }).first().click()
  await expect(page.getByText('몽이아빠님에게 답글 남기는 중')).toBeVisible()
  await page.getByRole('textbox', { name: '댓글 입력' }).fill('저도 끼워 주세요')
  await shot(page, 'sns-comment-02-reply-composer')

  await page.getByRole('button', { name: '게시' }).click()
  await expect(comments(page).getByRole('listitem').nth(2)).toContainText('저도 끼워 주세요')
  await expect(page.getByRole('textbox', { name: '댓글 입력' })).toHaveValue('')
  expect(sent).toEqual([
    {
      key: expect.any(String),
      body: { content: '저도 끼워 주세요', parentPublicId: commentId(1) },
    },
  ])
  await shot(page, 'sns-comment-03-reply-posted')
})

test('[AC-SNS04-E2E-012] 500자를 넘으면 카운터가 넘은 수를 알리고 게시가 꺼진다', async ({
  page,
}) => {
  await stubSns(page)
  await page.goto(`/sns/posts/${POST.publicId}`)

  await page.getByRole('textbox', { name: '댓글 입력' }).fill('산책'.repeat(251))
  await expect(page.getByText('502/500')).toBeVisible()
  await expect(page.getByRole('button', { name: '게시' })).toBeDisabled()
  await shot(page, 'sns-comment-04-over-limit')
})

test('[AC-SNS04-E2E-013] 남의 댓글을 길게 누르면 차단 시트가 열리고 내 댓글은 확인을 거쳐 지운다', async ({
  page,
}) => {
  await stubSns(page)
  await page.goto(`/sns/posts/${POST.publicId}`)

  await comments(page).getByText('코코 표정 너무 좋네요').click({ button: 'right' })
  await expect(page.getByRole('button', { name: '차단하기' })).toBeVisible()
  await shot(page, 'sns-comment-06-long-press-sheet')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '차단하기' })).toHaveCount(0)

  const mine = comments(page).getByRole('listitem').filter({ hasText: '산책 코스 어디예요?' })
  await mine.getByRole('button', { name: '삭제' }).click()
  await expect(page.getByRole('dialog').getByText('댓글을 삭제할까요?')).toBeVisible()
  await shot(page, 'sns-comment-05-delete-confirm')
  await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click()
  await expect(mine).toHaveCount(0)
  await expect(comments(page).getByRole('heading')).toHaveText('답글 3')
})

test('[AC-SNS04-E2E-014] 댓글이 없으면 첫 댓글을 권하고 알림으로 연 댓글은 목록 위에 고정한다', async ({
  page,
}) => {
  await stubSns(page)
  await page.goto(`/sns/posts/${EMPTY_POST.publicId}`)
  await expect(page.getByText('아직 댓글이 없어요')).toBeVisible()
  await shot(page, 'sns-comment-07-empty')

  await page.goto(`/sns/posts/${POST.publicId}?comment=${commentId(2)}`)
  const pinned = page.getByRole('group', { name: '알림으로 연 댓글' })
  await expect(pinned.getByText('감사해요. 다음에 같이 산책해요')).toBeVisible()
  await pinned.scrollIntoViewIfNeeded()
  await shot(page, 'sns-comment-08-pinned')
})

test('[AC-SNS04-E2E-015] 비로그인이 입력창을 누르면 요청 없이 로그인 안내 시트가 열린다', async ({
  page,
}) => {
  const { sent } = await stubSns(page, { member: false })
  await page.goto(`/sns/posts/${POST.publicId}`)

  await expect(comments(page).getByText('코코 표정 너무 좋네요')).toBeVisible()
  await page.getByRole('textbox', { name: '댓글 입력' }).click()
  await expect(
    page.getByRole('dialog').getByText('댓글은 로그인한 회원만 쓸 수 있어요.'),
  ).toBeVisible()
  await shot(page, 'sns-comment-09-guest-login-sheet')
  expect(sent).toEqual([])
})
