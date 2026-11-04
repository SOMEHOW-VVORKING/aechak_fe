import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { SNS_HASHTAGS_URL, server } from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'
import { SnsHashtagPicker, hashtagCountLabel } from '../components/SnsHashtagPicker'

const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderCompose() {
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/sns/posts/new'] }) })
  render(
    <QueryClientProvider client={queryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

// MSW 태그 수는 PRD 예시(#댕댕이 1,200, #댕댕 300, #댕청미 15)와 산책 계열 기본값에 시드 게시물의 태그 수를 합한 값이다.
const rows = () =>
  within(screen.getByRole('list', { name: '해시태그 목록' }))
    .getAllByRole('button')
    .map(button => button.getAttribute('aria-label'))

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '해시태그 추가' }))
  return screen.findByRole('textbox', { name: '해시태그 검색' })
}

beforeEach(() => {
  setAccessToken('test-token')
})

describe('해시태그 모달', () => {
  it('완료나 뒤로 가기로 닫으면 작성 화면의 해시태그 추가 버튼으로 포커스가 돌아온다', async () => {
    const user = userEvent.setup()
    renderCompose()

    await user.type(await openPicker(user), '산책')
    await user.click(await screen.findByRole('button', { name: '#산책 게시글 52 추가' }))
    await user.click(screen.getByRole('button', { name: '완료 1' }))
    expect(screen.getByRole('button', { name: '해시태그 추가' })).toHaveFocus()

    await openPicker(user)
    await user.click(screen.getByRole('button', { name: '뒤로 가기' }))
    expect(screen.getByRole('button', { name: '해시태그 추가' })).toHaveFocus()
  })

  it('처음 열면 검색창에 포커스가 있고 안내 없이 추천 태그만 게시글 수 순으로 나온다', async () => {
    const user = userEvent.setup()
    renderCompose()

    const search = await openPicker(user)
    expect(search).toHaveFocus()
    await waitFor(() =>
      expect(rows()).toEqual([
        '#댕댕이 게시글 1,200 추가',
        '#산책스타그램 게시글 840 추가',
        '#댕댕 게시글 300 추가',
        '#산책 게시글 52 추가',
        '#아침산책 게시글 31 추가',
        '#댕청미 게시글 15 추가',
        '#골든리트리버 게시글 1 추가',
        '#생일 게시글 1 추가',
      ]),
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('[AC-SNS02-011] 입력한 글자가 든 태그가 수 많은 순으로 수와 함께 나오고 새 해시태그 만들기 줄이 함께 나온다', async () => {
    const user = userEvent.setup()
    renderCompose()

    await user.type(await openPicker(user), '댕')
    await waitFor(() =>
      expect(rows()).toEqual([
        '#댕 새 해시태그 만들기 추가',
        '#댕댕이 게시글 1,200 추가',
        '#댕댕 게시글 300 추가',
        '#댕청미 게시글 15 추가',
      ]),
    )
  })

  it('[AC-SNS02-011] 정확히 같은 태그가 있으면 그 태그가 수와 함께 맨 위에 오고 목록에 다시 나오지 않는다', async () => {
    const user = userEvent.setup()
    renderCompose()

    await user.type(await openPicker(user), '#댕댕')
    await waitFor(() => expect(rows()).toEqual(['#댕댕 게시글 300 추가', '#댕댕이 게시글 1,200 추가']))
  })

  it('[AC-SNS02-012] 이미 단 태그를 표기만 바꿔 입력하면 추가됨으로 보이고 다시 추가하지 않는다', async () => {
    const user = userEvent.setup()
    renderCompose()
    const search = await openPicker(user)

    await user.type(search, 'dog')
    await user.click(await screen.findByRole('button', { name: '#dog 새 해시태그 만들기 추가' }))
    await user.type(search, '#DOG')
    const added = await screen.findByRole('button', { name: '#dog 새 해시태그 만들기 추가됨' })
    expect(added).toBeDisabled()
    expect(within(screen.getByRole('list', { name: '해시태그' })).getAllByRole('listitem')).toHaveLength(1)
  })

  it.each([
    ['쓸 수 없는 글자', '산 책!', '한글, 영문, 숫자, 밑줄만 쓸 수 있어요'],
    ['30자를 넘는 태그', 'a'.repeat(31), '해시태그는 30자 이하로 써 주세요'],
    ['금지어 해시태그', '욕설태그', '쓸 수 없는 단어예요'],
  ])('[AC-SNS02-013] %s는 안내만 보여주고 만들기 줄이 없다', async (_, input, notice) => {
    const user = userEvent.setup()
    renderCompose()

    await user.type(await openPicker(user), input)
    expect(await screen.findByText(notice)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /새 해시태그 만들기/ })).not.toBeInTheDocument()
  })

  it('[AC-SNS02-013] 해시태그 30개를 단 상태에서 더 추가하면 추가하지 않고 최대 30개라고 안내한다', async () => {
    const onDone = vi.fn()
    const user = userEvent.setup()
    const thirty = Array.from({ length: 30 }, (_, i) => `tag${i}`)
    render(
      <QueryClientProvider client={queryClient()}>
        <SnsHashtagPicker initial={thirty} onDone={onDone} onCancel={() => {}} />
      </QueryClientProvider>,
    )

    await user.type(screen.getByRole('textbox', { name: '해시태그 검색' }), 'extra')
    await user.click(await screen.findByRole('button', { name: '#extra 새 해시태그 만들기 추가' }))
    expect(await screen.findByText('해시태그는 30개까지 달 수 있어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '완료 30' }))
    expect(onDone).toHaveBeenCalledWith(thirty)
  })

  it('완료를 눌러야 작성 화면에 칩이 붙고 뒤로 가기는 고른 태그를 버린다', async () => {
    const user = userEvent.setup()
    renderCompose()

    await user.type(await openPicker(user), '산책')
    await user.click(await screen.findByRole('button', { name: '#산책 게시글 52 추가' }))
    await user.click(screen.getByRole('button', { name: '뒤로 가기' }))
    expect(await screen.findByLabelText('캡션')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '해시태그' })).not.toBeInTheDocument()

    await user.type(await openPicker(user), '산책')
    await user.click(await screen.findByRole('button', { name: '#산책 게시글 52 추가' }))
    await user.click(screen.getByRole('button', { name: '완료 1' }))
    expect(await screen.findByRole('button', { name: '#산책 빼기' })).toBeInTheDocument()
  })

  it('[AC-SNS02-005] 캡션과 첨부 없이 해시태그만 있으면 게시 버튼이 꺼져 있다', async () => {
    const user = userEvent.setup()
    renderCompose()

    await user.type(await openPicker(user), '산책')
    await user.click(await screen.findByRole('button', { name: '#산책 게시글 52 추가' }))
    await user.click(screen.getByRole('button', { name: '완료 1' }))
    expect(await screen.findByRole('button', { name: '게시' })).toBeDisabled()
  })

  it('칩의 이름으로 게시하고 상세에 해시태그가 나온다', async () => {
    const user = userEvent.setup()
    const router = renderCompose()

    await user.type(await screen.findByLabelText('캡션'), '태그 단 글')
    await user.type(await openPicker(user), '#Walk')
    await user.click(await screen.findByRole('button', { name: '#walk 새 해시태그 만들기 추가' }))
    await user.click(screen.getByRole('button', { name: '완료 1' }))
    await user.click(await screen.findByRole('button', { name: '게시' }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/sns\/posts\/01K/))
    expect(await screen.findByRole('list', { name: '해시태그' })).toHaveTextContent('#walk')
  })
})

describe('해시태그 모달 경합과 실패', () => {
  it('새 응답을 기다리는 동안 Enter를 눌러도 이전 검색의 태그를 달지 않는다', async () => {
    let release = () => {}
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    server.use(
      http.get(SNS_HASHTAGS_URL, async ({ request }) => {
        if (new URL(request.url).searchParams.get('query') === 'cat') await held
        return undefined
      }),
    )
    const user = userEvent.setup()
    renderCompose()
    const search = await openPicker(user)

    await user.type(search, 'dog')
    expect(await screen.findByRole('button', { name: '#dog 새 해시태그 만들기 추가' })).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'cat')
    // 디바운스가 끝나 cat을 보냈지만 응답 전이라 화면에는 dog 결과가 남아 있다.
    await new Promise(resolve => setTimeout(resolve, 400))
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('list', { name: '해시태그' })).not.toBeInTheDocument()

    release()
    expect(await screen.findByRole('button', { name: '#cat 새 해시태그 만들기 추가' })).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('button', { name: '#cat 빼기' })).toBeInTheDocument()
  })

  it('조회가 실패하면 안내를 보여주고 남은 결과로는 추가하지 않는다', async () => {
    let down = false
    server.use(http.get(SNS_HASHTAGS_URL, () => (down ? new HttpResponse(null, { status: 404 }) : undefined)))
    const user = userEvent.setup()
    renderCompose()
    const search = await openPicker(user)
    await user.type(search, 'dog')
    await screen.findByRole('button', { name: '#dog 새 해시태그 만들기 추가' })

    // 화면으로 돌아오면(visibilitychange) 같은 검색어를 다시 읽는다. 그 조회가 실패해도 이전 결과는 남는다.
    down = true
    window.dispatchEvent(new Event('visibilitychange'))
    expect(await screen.findByText(/해시태그를 불러오지 못했어요/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '#dog 새 해시태그 만들기 추가' })).toBeDisabled()

    down = false
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '#dog 새 해시태그 만들기 추가' })).toBeEnabled())
    expect(screen.queryByText(/해시태그를 불러오지 못했어요/)).not.toBeInTheDocument()
  })

  it('해시태그 모달을 연 채 다른 화면으로 이동해도 작성 취소 확인이 보인다', async () => {
    const user = userEvent.setup()
    const router = renderCompose()
    await user.type(await screen.findByLabelText('캡션'), '쓰던 글')
    await openPicker(user)

    void router.navigate({ to: '/market' })
    expect(await screen.findByText('작성을 취소할까요?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '나가기' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/market'))
  })
})

describe('hashtagCountLabel', () => {
  it('만 단위는 소수 첫째 자리까지 내림으로 쓴다', () => {
    expect(hashtagCountLabel(9_210)).toBe('9,210')
    expect(hashtagCountLabel(124_999)).toBe('12.4만')
    expect(hashtagCountLabel(99_999)).toBe('9.9만')
    expect(hashtagCountLabel(10_000)).toBe('1만')
  })
})
