import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { setAccessToken } from '@aechak/api'
import { resetAuth } from '@/shared/auth'
import {
  SNS_COMMENT_MINE,
  SNS_ME,
  SNS_MONG,
  SNS_POST_COCO,
  currentSns,
  seedSns,
  snsComment,
  snsExampleComments,
} from '@/testing/msw/server'
import { routeTree } from '../../../routeTree.gen'

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const section = () => screen.getByRole('region', { name: '댓글' })
const rowOf = (text: string) => within(section()).getByText(text).closest('li')!
const editor = () => screen.getByRole('textbox', { name: '댓글 수정' })
const saveButton = () => within(editor().closest('li')!).getByRole('button', { name: '저장' })
const mine = () => currentSns().comments.find(r => r.publicId === SNS_COMMENT_MINE)!

async function openDetail() {
  renderAt(`/sns/posts/${SNS_POST_COCO}`)
  await within(await screen.findByRole('region', { name: '댓글' })).findByText(
    '산책 코스 어디예요?',
  )
}

beforeEach(() => {
  resetAuth()
  setAccessToken('test-token')
  seedSns({ viewer: SNS_ME, comments: snsExampleComments() })
})

describe('댓글 수정', () => {
  it('[AC-SNS04-029] 그 자리에서 고치고 저장하면 바뀐 내용과 수정됨을 그린다', async () => {
    const user = userEvent.setup()
    await openDetail()

    await user.click(within(rowOf('산책 코스 어디예요?')).getByRole('button', { name: '수정' }))
    expect(editor()).toHaveValue('산책 코스 어디예요?')
    await user.clear(editor())
    await user.type(editor(), '산책 코스 알려 주세요')
    await user.click(saveButton())

    const row = await within(section()).findByText('산책 코스 알려 주세요')
    expect(within(row.closest('li')!).getByText('수정됨')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '댓글 수정' })).toBeNull()
    expect(mine().content).toBe('산책 코스 알려 주세요')
  })

  it('[AC-SNS04-029] 취소하면 원래 내용으로 돌아간다', async () => {
    const user = userEvent.setup()
    await openDetail()

    await user.click(within(rowOf('산책 코스 어디예요?')).getByRole('button', { name: '수정' }))
    await user.type(editor(), ' 바꾸는 중')
    await user.click(screen.getByRole('button', { name: '취소' }))

    expect(within(section()).getByText('산책 코스 어디예요?')).toBeInTheDocument()
    expect(mine().edited).toBe(false)
  })

  it('[AC-SNS04-030] 금지어가 많으면 안내하고 고친 내용을 남기며 비었거나 500자를 넘으면 저장이 꺼진다', async () => {
    const user = userEvent.setup()
    await openDetail()
    await user.click(within(rowOf('산책 코스 어디예요?')).getByRole('button', { name: '수정' }))

    await user.clear(editor())
    expect(saveButton()).toBeDisabled()
    await user.click(editor())
    await user.paste('가'.repeat(501))
    expect(saveButton()).toBeDisabled()

    await user.clear(editor())
    await user.type(editor(), '욕설 욕설 산책')
    await user.click(saveButton())

    expect(await screen.findByText('부적절한 표현이 있어 등록할 수 없어요')).toBeInTheDocument()
    expect(editor()).toHaveValue('욕설 욕설 산책')
    expect(mine().content).toBe('산책 코스 어디예요?')
  })

  it('[AC-SNS04-030] 그사이 지운 댓글이면 찾을 수 없다고 알리고 목록을 다시 읽는다', async () => {
    const user = userEvent.setup()
    await openDetail()
    await user.click(within(rowOf('산책 코스 어디예요?')).getByRole('button', { name: '수정' }))
    seedSns({
      ...currentSns(),
      comments: currentSns().comments.map(r =>
        r.publicId === SNS_COMMENT_MINE ? { ...r, deleted: true, content: null } : r,
      ),
    })

    await user.type(editor(), '!')
    await user.click(saveButton())

    expect(await screen.findByText('댓글을 찾을 수 없어요')).toBeInTheDocument()
    await waitFor(() => expect(within(section()).queryByText('산책 코스 어디예요?')).toBeNull())
  })
})

describe('댓글 삭제', () => {
  it('[AC-SNS04-031][AC-SNS04-032] 확인을 거쳐 지우면 대댓글 없는 댓글은 목록에서 빠지고 수가 준다', async () => {
    const user = userEvent.setup()
    await openDetail()
    expect(within(section()).getByRole('heading').textContent).toBe('답글 4')

    await user.click(within(rowOf('산책 코스 어디예요?')).getByRole('button', { name: '삭제' }))
    expect(screen.getByText('댓글을 삭제할까요?')).toBeInTheDocument()
    expect(screen.getByText('삭제한 댓글은 복구할 수 없어요.')).toBeInTheDocument()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(within(section()).queryByText('산책 코스 어디예요?')).toBeNull())
    await waitFor(() => expect(within(section()).getByRole('heading').textContent).toBe('답글 3'))
    expect(mine().deleted).toBe(true)
  })

  it('[AC-SNS04-031] 대댓글이 남은 내 최상위 댓글을 지우면 안내 문구로 남는다', async () => {
    const root = '01KC0000000000000000000077'
    seedSns({
      viewer: SNS_ME,
      comments: [
        snsComment(root, SNS_POST_COCO, SNS_ME, { content: '내 최상위 댓글' }),
        snsComment('01KC0000000000000000000078', SNS_POST_COCO, SNS_MONG, {
          parent: root,
          content: '남은 대댓글',
        }),
      ],
    })
    const user = userEvent.setup()
    renderAt(`/sns/posts/${SNS_POST_COCO}`)
    await within(await screen.findByRole('region', { name: '댓글' })).findByText('내 최상위 댓글')

    await user.click(within(rowOf('내 최상위 댓글')).getByRole('button', { name: '삭제' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))

    expect(await within(section()).findByText('삭제된 댓글이에요')).toBeInTheDocument()
    expect(within(section()).getByText('남은 대댓글')).toBeInTheDocument()
  })

  it('취소하면 지우지 않는다', async () => {
    const user = userEvent.setup()
    await openDetail()

    await user.click(within(rowOf('산책 코스 어디예요?')).getByRole('button', { name: '삭제' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))

    expect(within(section()).getByText('산책 코스 어디예요?')).toBeInTheDocument()
    expect(mine().deleted).toBe(false)
  })
})
