import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { logout, resetAuth } from '@/shared/auth'
import {
  SNS_POST_COCO,
  SNS_POST_MINE,
  SNS_POST_MINE_PHOTO,
  SNS_POST_URL,
  WEB_REFRESH_URL,
  currentSns,
  seedSns,
  server,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(
  path: string,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const editPath = (publicId: string) => `/sns/posts/${publicId}/edit`
const saveButton = () => screen.getByRole('button', { name: '저장' })

let patchBodies: unknown[] = []
let postGets = 0

beforeEach(() => {
  setAccessToken('test-token')
  patchBodies = []
  postGets = 0
  server.events.on('request:start', async ({ request }) => {
    if (!/\/sns\/posts\/[^/]+$/.test(new URL(request.url).pathname)) return
    if (request.method === 'PATCH') patchBodies.push(await request.clone().json())
    if (request.method === 'GET') postGets += 1
  })
})

afterEach(() => {
  server.events.removeAllListeners()
})

describe('/sns/posts/$publicId/edit 수정', () => {
  it('[AC-SNS02-024][AC-SNS02-029] 캡션과 태그를 고쳐 저장하면 같은 상세 주소에 바뀐 내용과 수정됨이 나온다', async () => {
    const user = userEvent.setup()
    const router = renderAt(editPath(SNS_POST_MINE_PHOTO))

    const caption = await screen.findByLabelText('캡션')
    expect(caption).toHaveValue('보리 생일')
    await user.clear(caption)
    await user.type(caption, '보리 두 살 생일')
    await user.click(screen.getByRole('button', { name: '#생일 빼기' }))
    await user.click(screen.getByRole('button', { name: '해시태그 추가' }))
    await user.type(await screen.findByRole('textbox', { name: '해시태그 검색' }), '산책')
    await user.click(await screen.findByRole('button', { name: '#산책 게시글 52 추가' }))
    await user.click(screen.getByRole('button', { name: '완료 1' }))
    await user.click(saveButton())

    await waitFor(() => expect(router.state.location.pathname).toBe(`/sns/posts/${SNS_POST_MINE_PHOTO}`))
    expect(await screen.findByText('보리 두 살 생일')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '해시태그' })).toHaveTextContent('#산책')
    expect(screen.getByText('수정됨')).toBeInTheDocument()
    expect(patchBodies).toEqual([{ caption: '보리 두 살 생일', hashtags: ['산책'] }])
  })

  it('[AC-SNS02-024] 아무것도 바꾸지 않고 저장하면 수정됨 표시가 붙지 않는다', async () => {
    const user = userEvent.setup()
    renderAt(editPath(SNS_POST_MINE_PHOTO))

    await screen.findByLabelText('캡션')
    await user.click(saveButton())
    expect(await screen.findByText('보리 생일')).toBeInTheDocument()
    expect(screen.queryByText('수정됨')).not.toBeInTheDocument()
    // 태그를 고르지 않았어도 필수인 hashtags에 지금 태그를 그대로 보낸다(빈 배열이면 태그가 지워진다).
    expect(patchBodies).toEqual([{ caption: '보리 생일', hashtags: ['생일'] }])
  })

  it('해시태그 모달을 닫으면 수정 화면의 해시태그 추가 버튼으로 포커스가 돌아온다', async () => {
    const user = userEvent.setup()
    renderAt(editPath(SNS_POST_MINE_PHOTO))

    await user.click(await screen.findByRole('button', { name: '해시태그 추가' }))
    await user.click(await screen.findByRole('button', { name: '완료 1' }))
    expect(screen.getByRole('button', { name: '해시태그 추가' })).toHaveFocus()
  })

  it('[AC-SNS02-025] 사진 영역은 바꿀 수 없게 그린다', async () => {
    renderAt(editPath(SNS_POST_MINE_PHOTO))

    const media = await screen.findByRole('region', { name: '첨부 미디어' })
    expect(within(media).getAllByRole('img').map(img => img.getAttribute('alt'))).toEqual(['사진 1', '사진 2'])
    expect(within(media).queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText('사진과 영상은 바꿀 수 없어요.')).toBeInTheDocument()
  })

  it('[AC-SNS02-025] 텍스트 게시물의 캡션을 모두 지우면 저장 버튼이 꺼진다', async () => {
    const user = userEvent.setup()
    renderAt(editPath(SNS_POST_MINE))

    const caption = await screen.findByLabelText('캡션')
    expect(saveButton()).toBeEnabled()
    await user.clear(caption)
    await user.type(caption, '   ')
    expect(saveButton()).toBeDisabled()
  })

  it('[AC-SNS02-028] 다른 기기에서 지운 게시물을 저장하면 삭제된 게시물 안내가 나온다', async () => {
    const user = userEvent.setup()
    renderAt(editPath(SNS_POST_MINE))
    await user.type(await screen.findByLabelText('캡션'), ' 수정')

    seedSns({ posts: currentSns().posts.map(p => (p.publicId === SNS_POST_MINE ? { ...p, deleted: true } : p)) })
    await user.click(saveButton())
    expect(await screen.findByText('삭제된 게시물이에요')).toBeInTheDocument()
  })

  it('[AC-SNS02-028] 저장하다 삭제된 게시물임을 알면 상세로 돌아가도 남은 캐시 대신 삭제된 게시물 안내가 나온다', async () => {
    const user = userEvent.setup()
    // 앱과 같은 staleTime이면 상세로 돌아가도 캐시만 쓴다.
    const router = renderAt(
      editPath(SNS_POST_MINE),
      new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } }),
    )
    await user.type(await screen.findByLabelText('캡션'), ' 수정')
    seedSns({ posts: currentSns().posts.map(p => (p.publicId === SNS_POST_MINE ? { ...p, deleted: true } : p)) })
    await user.click(saveButton())
    expect(await screen.findByText('삭제된 게시물이에요')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '뒤로 가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/sns/posts/${SNS_POST_MINE}`))
    // 수정 화면의 같은 안내를 잡지 않게 상세 화면으로 바뀐 뒤에 본다.
    expect(await screen.findByText('게시물')).toBeInTheDocument()
    expect(await screen.findByText('삭제된 게시물이에요')).toBeInTheDocument()
    expect(screen.queryByText('산책 코스 추천받아요')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '더보기' })).not.toBeInTheDocument()
  })

  it('[AC-SNS02-033] 수정으로 금지어 비율을 넘기면 거부되고 입력이 남는다', async () => {
    const user = userEvent.setup()
    renderAt(editPath(SNS_POST_MINE))
    const caption = await screen.findByLabelText('캡션')

    await user.clear(caption)
    await user.type(caption, '욕설 욕설')
    await user.click(saveButton())
    expect(await screen.findByText('쓸 수 없는 단어가 많아 올릴 수 없어요. 내용을 고쳐 주세요')).toBeInTheDocument()
    expect(caption).toHaveValue('욕설 욕설')
  })

  it('저장 중에는 해시태그 칩을 뺄 수 없다', async () => {
    let release = () => {}
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.patch(SNS_POST_URL, async () => {
        await held
        return undefined
      }),
    )
    const user = userEvent.setup()
    const router = renderAt(editPath(SNS_POST_MINE_PHOTO))
    await screen.findByLabelText('캡션')
    await user.click(saveButton())

    await waitFor(() => expect(screen.getByRole('button', { name: '#생일 빼기' })).toBeDisabled())
    release()
    await waitFor(() => expect(router.state.location.pathname).toBe(`/sns/posts/${SNS_POST_MINE_PHOTO}`))
    expect(patchBodies).toEqual([{ caption: '보리 생일', hashtags: ['생일'] }])
  })

  it('본인 게시물이 아니면 수정 화면 대신 상세로 보낸다', async () => {
    const router = renderAt(editPath(SNS_POST_COCO))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/sns/posts/${SNS_POST_COCO}`))
    expect(await screen.findByText('오늘 코코랑 한강 산책')).toBeInTheDocument()
    expect(patchBodies).toHaveLength(0)
  })

  it('세션을 확인하기 전에 토큰 없이 읽은 내 게시물은 상세로 보내지 않고 회원으로 확인되면 폼을 채운다', async () => {
    // 새로고침 뒤 refresh가 5xx면 세션은 확인 전(unknown)으로 남고 상세는 토큰 없이 읽혀 isMine이 false다.
    resetAuth()
    server.use(http.post(WEB_REFRESH_URL, () => new HttpResponse(null, { status: 503 })))
    const router = renderAt(editPath(SNS_POST_MINE))
    await waitFor(() => expect(postGets).toBe(1))
    // 응답이 화면에 닿고 이동 여부가 정해질 때까지 기다린다.
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(router.state.location.pathname).toBe(editPath(SNS_POST_MINE))

    act(() => setAccessToken('test-token'))
    expect(await screen.findByLabelText('캡션')).toHaveValue('산책 코스 추천받아요')
    expect(router.state.location.pathname).toBe(editPath(SNS_POST_MINE))
  })

  it('비로그인이 주소로 바로 들어오면 요청 없이 로그인 안내 시트를 연다', async () => {
    logout()
    seedSns({ viewer: null })
    renderAt(editPath(SNS_POST_MINE))

    expect(await screen.findByText(/글 작성은 로그인한 회원만 이용할 수 있어요/)).toBeInTheDocument()
    expect(postGets).toBe(0)
  })
})

describe('/sns/posts/$publicId 내 게시물 더보기', () => {
  it('[AC-SNS02-026] 본인 게시물 더보기에는 링크 복사, 수정, 삭제가 있다', async () => {
    const user = userEvent.setup()
    const router = renderAt(`/sns/posts/${SNS_POST_MINE}`)

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getAllByRole('button').map(b => b.textContent)).toEqual(['링크 복사', '수정', '삭제'])

    await user.click(within(sheet).getByRole('button', { name: '수정' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(editPath(SNS_POST_MINE)))
  })

  it('[AC-SNS02-027] 삭제는 확인 모달을 거치고 지운 뒤 이전 화면으로 간다', async () => {
    const user = userEvent.setup()
    const router = renderAt(`/sns/posts/${SNS_POST_MINE}`)

    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '삭제' }))
    expect(await screen.findByText('게시물을 삭제할까요?')).toBeInTheDocument()
    expect(currentSns().posts.find(p => p.publicId === SNS_POST_MINE)?.deleted).toBe(false)
    await user.click(within(screen.getByRole('dialog', { name: '게시물을 삭제할까요?' })).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sns'))
    expect(currentSns().posts.find(p => p.publicId === SNS_POST_MINE)?.deleted).toBe(true)
    // 이전 화면으로 가는 동안 지운 게시물을 다시 읽지 않는다(처음 연 한 번뿐이다).
    expect(postGets).toBe(1)
  })

  it('[AC-SNS02-027] 지운 게시물을 다시 열면 남은 캐시 대신 삭제된 게시물 안내를 보여준다', async () => {
    const user = userEvent.setup()
    // 앱과 같은 staleTime이면 다시 열어도 캐시만 쓴다. 지운 뒤에는 서버에 다시 물어야 한다.
    const router = renderAt(
      `/sns/posts/${SNS_POST_MINE}`,
      new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } }),
    )
    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '삭제' }))
    await user.click(within(screen.getByRole('dialog', { name: '게시물을 삭제할까요?' })).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/sns'))

    await router.navigate({ to: '/sns/posts/$publicId', params: { publicId: SNS_POST_MINE } })
    expect(await screen.findByText('삭제된 게시물이에요')).toBeInTheDocument()
  })

  it('[AC-SNS02-027] 다른 기기에서 이미 지운 게시물을 다시 지워도 오류 없이 이전 화면으로 간다', async () => {
    const user = userEvent.setup()
    const router = renderAt(`/sns/posts/${SNS_POST_MINE}`)
    await user.click(await screen.findByRole('button', { name: '더보기' }))
    await user.click(await screen.findByRole('button', { name: '삭제' }))

    // 다른 기기에서 지운 뒤 없는 게시물이 됐다(404 130400).
    seedSns({ posts: currentSns().posts.filter(p => p.publicId !== SNS_POST_MINE) })
    await user.click(within(screen.getByRole('dialog', { name: '게시물을 삭제할까요?' })).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/sns'))
    expect(screen.queryByText('삭제하지 못했어요. 다시 시도해 주세요')).not.toBeInTheDocument()
  })
})
