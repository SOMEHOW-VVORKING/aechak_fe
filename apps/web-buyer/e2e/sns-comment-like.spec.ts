import { test, expect, type Page, type Route } from '@playwright/test'
import type { SnsCommentItemResult, SnsLikerListResult, SnsPostDetailResult } from '@aechak/api'

// SNS-04 댓글 좋아요와 댓글 좋아요한 사람(b7-st-2 2-A, b7-st-9 9-B) E2E. 실백엔드 없이 page.route 스텁으로
// contracts/sns.yaml SNS-04의 댓글 목록, 단건, 댓글 좋아요 켜기와 끄기, 댓글 좋아요한 사람 응답을 재현한다
// (교차 출처 8080 + withCredentials라 정확한 origin과 Allow-Credentials, OPTIONS 방어 필수). 각 상태를 PR 첨부용으로
// test-results/pr-cl(gitignore)에 찍는다.

const ORIGIN = 'http://localhost:5175'
const API = 'http://localhost:8080/api/v1'
const CORS = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
}
const SHOTS = 'test-results/pr-cl'

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
  return route.fulfill({ status, headers: CORS, json })
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

const commentId = (n: number) => `01K8E2E0SNSCOMMENT0000${String(n).padStart(3, '0')}`

function item(
  n: number,
  author: SnsCommentItemResult['author'],
  fields: Partial<SnsCommentItemResult> = {},
): SnsCommentItemResult {
  return {
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
}

// 몽이아빠 댓글(내가 좋아요, 수 3)과 코코집사 대댓글, 지운 최상위 댓글 아래 남은 초코맘 대댓글, 내 댓글.
const THREAD = (): SnsCommentItemResult[] => [
  item(1, MONG, {
    content: '코코 표정 너무 좋네요',
    likeCount: 3,
    liked: true,
    createdAt: ago(150),
  }),
  item(2, COCO, {
    parentPublicId: commentId(1),
    content: '감사해요. 다음에 같이 산책해요',
    likeCount: 1,
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

const liker = (user: typeof ME, fields: Partial<SnsLikerListResult['items'][number]> = {}) => ({
  publicId: user.publicId,
  nickname: user.nickname,
  profileImageUrl: null,
  pet: null,
  isMe: user.publicId === ME.publicId,
  following: false,
  ...fields,
})

// 스텁하지 않은 API 호출은 여기 모았다가 테스트 끝에 비어 있는지 본다.
let unexpected: string[] = []
test.afterEach(() => expect(unexpected).toEqual([]))

async function stubSns(page: Page, { member = true }: { member?: boolean } = {}) {
  const list = THREAD()
  const likers = new Map<string, Array<ReturnType<typeof liker>>>([
    [
      commentId(1),
      [
        liker(ME),
        liker(COCO, { pet: { breedLabel: '말티즈', birthYearMonth: '2022-03' }, following: true }),
        liker(CHOCO),
      ],
    ],
  ])
  const likes: string[] = []
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
  await page.route(`${API}/sns/posts/*`, route => fulfill(route, 200, { data: POST }))
  await page.route(`${API}/sns/posts/*/comments*`, route => {
    const items = member ? list : list.map(i => ({ ...i, isMine: false, liked: false }))
    return fulfill(route, 200, { data: { items, nextCursor: null, hasNext: false } })
  })
  const found = (route: Route) =>
    list.find(i => i.publicId === new URL(route.request().url()).pathname.split('/').at(-2))
  const unavailable = (route: Route) =>
    fulfill(route, 404, { errorCode: 130700, message: '볼 수 없는 댓글입니다.' })
  await page.route(`${API}/sns/comments/*`, route => {
    const id = new URL(route.request().url()).pathname.split('/').pop()!
    const comment = list.find(i => i.publicId === id && i.status === 'ACTIVE')
    if (!comment) return unavailable(route)
    const parent = comment.parentPublicId
      ? list.find(i => i.publicId === comment.parentPublicId)!
      : null
    return fulfill(route, 200, { data: { comment, parent } })
  })
  await page.route(`${API}/sns/comments/*/like`, route => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return fulfill(route, 204)
    const comment = found(route)
    if (!comment || comment.status !== 'ACTIVE') return unavailable(route)
    const on = request.method() === 'POST'
    likes.push(`${request.method()} ${comment.publicId}`)
    if (comment.liked !== on) comment.likeCount += on ? 1 : -1
    comment.liked = on
    return fulfill(route, on ? 201 : 200, { data: { likeCount: comment.likeCount } })
  })
  await page.route(`${API}/sns/comments/*/likers`, route => {
    const comment = found(route)
    if (!comment || comment.status !== 'ACTIVE') return unavailable(route)
    const items = likers.get(comment.publicId) ?? []
    return fulfill(route, 200, {
      data: { likeCount: comment.likeCount, hasMore: false, items },
    })
  })
  return { likes }
}

const comments = (page: Page) => page.getByRole('region', { name: '댓글' })
const rowOf = (page: Page, text: string) =>
  comments(page).getByRole('listitem').filter({ hasText: text })

test('[AC-SNS04-E2E-020] 댓글마다 좋아요와 수가 있고 누르면 바로 채워지며 안내 문구 항목에는 버튼이 없다', async ({
  page,
}) => {
  const { likes } = await stubSns(page)
  await page.goto(`/sns/posts/${POST.publicId}`)

  const mine = rowOf(page, '산책 코스 어디예요?')
  await expect(
    rowOf(page, '코코 표정 너무 좋네요').getByRole('button', { name: /님 댓글 좋아요$/ }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    rowOf(page, '삭제된 댓글이에요').getByRole('button', { name: /님 댓글 좋아요$/ }),
  ).toHaveCount(0)

  await mine.getByRole('button', { name: /님 댓글 좋아요$/ }).click()
  await expect(mine.getByRole('button', { name: /님 댓글 좋아요$/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(mine.getByRole('button', { name: /댓글 좋아요한 사람/ })).toHaveText(/1$/)
  expect(likes).toEqual([`POST ${commentId(5)}`])
  await comments(page).scrollIntoViewIfNeeded()
  await shot(page, 'sns-comment-like-01-list')
})

test('[AC-SNS04-E2E-021] 좋아요 수를 누르면 위에 대상 댓글 카드가 있는 댓글 좋아요한 사람 화면이 열린다', async ({
  page,
}) => {
  await stubSns(page)
  await page.goto(`/sns/posts/${POST.publicId}`)

  await rowOf(page, '코코 표정 너무 좋네요')
    .getByRole('button', { name: /댓글 좋아요한 사람/ })
    .first()
    .click()
  await expect(page).toHaveURL(new RegExp(`/sns/comments/${commentId(1)}/likers$`))
  const card = page.getByRole('group', { name: '좋아요한 댓글' })
  await expect(card).toContainText('코코 표정 너무 좋네요')
  await expect(page.getByText('좋아요한 3명을 표시했어요')).toBeVisible()
  await shot(page, 'sns-comment-like-02-likers')
})

test('[AC-SNS04-E2E-022] 볼 수 없는 댓글의 좋아요한 사람 주소는 댓글을 찾을 수 없다는 안내다', async ({
  page,
}) => {
  await stubSns(page)
  await page.goto(`/sns/comments/${commentId(3)}/likers`)

  await expect(page.getByText('댓글을 찾을 수 없어요')).toBeVisible()
  await shot(page, 'sns-comment-like-03-likers-unavailable')
})

test('[AC-SNS04-E2E-023] 비로그인이 댓글 좋아요를 누르면 로그인 안내 시트가 열린다', async ({
  page,
}) => {
  const { likes } = await stubSns(page, { member: false })
  await page.goto(`/sns/posts/${POST.publicId}`)

  await rowOf(page, '코코 표정 너무 좋네요')
    .getByRole('button', { name: /님 댓글 좋아요$/ })
    .first()
    .click()
  await expect(page.getByText(/좋아요는 로그인한 회원만 이용할 수 있어요/)).toBeVisible()
  expect(likes).toEqual([])
  await shot(page, 'sns-comment-like-04-guest-gate')
})
