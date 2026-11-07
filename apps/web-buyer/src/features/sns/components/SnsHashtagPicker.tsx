import { useEffect, useState, type KeyboardEvent } from 'react'
import { Check, ChevronLeft, Hash, Plus, X } from 'lucide-react'
import { Button, MobileScreen } from '@aechak/design-system/web'
import type { SnsHashtagResult, SnsHashtagSearchStatus } from '@aechak/api'
import { HASHTAG_MAX, useHashtagSearch } from '../sns.queries'

const SEARCH_DEBOUNCE_MS = 250

// 검색 상태별 안내(design 6절 6번). 이 셋은 안내만 보여주고 추가하지 않는다.
const STATUS_NOTICE: Partial<Record<SnsHashtagSearchStatus, string>> = {
  INVALID: '한글, 영문, 숫자, 밑줄만 쓸 수 있어요',
  TOO_LONG: '해시태그는 30자 이하로 써 주세요',
  BANNED: '쓸 수 없는 단어예요',
}

const LIMIT_NOTICE = `해시태그는 ${HASHTAG_MAX}개까지 달 수 있어요`

/** 게시글 수. 만 단위는 소수 첫째 자리까지 내림으로 쓴다(`12.4만`). */
export function hashtagCountLabel(count: number): string {
  if (count < 10_000) return count.toLocaleString('ko-KR')
  return `${Math.floor(count / 1_000) / 10}만`
}

/** 작성, 수정 화면의 해시태그 칩. 칩에는 서버가 정규화한 이름을 쓴다 */
export function HashtagChips({
  tags,
  onRemove,
  disabled = false,
}: {
  tags: string[]
  onRemove?: (tag: string) => void
  /** 게시나 저장 중에는 빼지 않는다. 그때 뺀 태그는 이미 보낸 요청에 실리지 않는다 */
  disabled?: boolean
}) {
  if (tags.length === 0) return null
  return (
    <ul aria-label="해시태그" className="flex flex-wrap gap-2">
      {tags.map(tag => (
        <li
          key={tag}
          className="inline-flex h-8 items-center gap-1 rounded-chip bg-brand-subtle pl-3 pr-2 text-body-sm font-medium text-text-brand"
        >
          #{tag}
          {onRemove && (
            <button
              type="button"
              aria-label={`#${tag} 빼기`}
              disabled={disabled}
              onClick={() => onRemove(tag)}
              // 보이는 원(20px)은 두고 누르는 자리만 사방 10px씩 넓혀 40px로 둔다. 칩 밖으로는 칩 사이 간격(8px)보다 덜
              // 나가 이웃 칩과 버튼의 누르는 자리와 겹치지 않는다.
              className="relative flex size-5 items-center justify-center rounded-full before:absolute before:-inset-2.5 before:content-[''] disabled:opacity-40 focus-visible:outline-none focus-visible:shadow-focus-ring"
            >
              <X className="size-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

// 해시태그 모달(b7-st-3 3-B). 고른 태그는 초안으로 들고 있다가 완료를 누를 때만 화면에 넘긴다. 뒤로 가기는 초안을 버린다.
// 입력은 디바운스 뒤 GET /sns/hashtags로 보내고 응답 status로 그린다. 정규화는 서버가 하고 칩에는 응답 이름을 쓴다.
export function SnsHashtagPicker({
  initial,
  onDone,
  onCancel,
}: {
  initial: string[]
  onDone: (tags: string[]) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [limitNotice, setLimitNotice] = useState(false)
  const search = useHashtagSearch(query)
  const result = search.data
  // 조회가 실패한 동안에는 남은 결과로 추가하지 않는다(AGENTS.md 6절 7).
  const failed = search.isError

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input])

  const add = (name: string) => {
    if (draft.includes(name)) return
    if (draft.length >= HASHTAG_MAX) {
      setLimitNotice(true)
      return
    }
    setDraft(prev => [...prev, name])
    setInput('')
  }

  const remove = (name: string) => {
    setDraft(prev => prev.filter(tag => tag !== name))
    setLimitNotice(false)
  }

  // 정확히 같은 태그가 있으면(EXISTS) 그 태그를, 없으면(NEW) 새 태그를 만드는 줄이 목록 맨 위에 온다.
  const top: SnsHashtagResult | null =
    result?.status === 'EXISTS'
      ? result.exact
      : result?.status === 'NEW'
        ? { name: result.query, postCount: 0 }
        : null

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    // 지금 입력에 대한 응답일 때만 추가한다. 디바운스 중이거나 새 응답을 기다리며 이전 결과를 보여주는 동안에는 넘긴다.
    if (top && query === input && !search.isPlaceholderData && !failed) add(top.name)
  }

  const notice = limitNotice ? LIMIT_NOTICE : result && STATUS_NOTICE[result.status]
  // BANNED의 부분 일치 태그는 모두 금지어를 품고 있어 달면 게시가 130502로 거부된다. 목록을 그리지 않는다.
  const items = result && result.status !== 'BANNED' ? result.items : []

  return (
    <MobileScreen
      header={
        <div className="flex h-14 items-center gap-2 px-2">
          <button
            type="button"
            aria-label="뒤로 가기"
            onClick={onCancel}
            className="flex size-10 flex-none items-center justify-center rounded-full text-icon focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            <ChevronLeft className="size-6" />
          </button>
          <span className="text-subheading font-semibold text-text-primary">해시태그</span>
          <div className="ml-auto pr-1">
            <Button size="sm" onClick={() => onDone(draft)}>
              완료 {draft.length}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3 px-4 pb-6 pt-1">
        <label className="flex h-11 items-center gap-2 rounded-input border border-border-focus bg-surface-raised px-3">
          <Hash className="size-[18px] flex-none text-icon" />
          <input
            // 모달을 열면 바로 입력할 수 있게 검색창에 포커스를 둔다(b7-st-3 3-B).
            autoFocus
            aria-label="해시태그 검색"
            value={input}
            onChange={e => {
              setInput(e.target.value)
              setLimitNotice(false)
            }}
            onKeyDown={onKeyDown}
            placeholder="해시태그를 입력해 주세요"
            className="min-w-0 flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-placeholder"
          />
          {input !== '' && (
            // 누르는 자리를 40px로 두고 아이콘은 전과 같은 자리에 오게 오른쪽 여백만큼 당긴다.
            <button
              type="button"
              aria-label="입력 지우기"
              onClick={() => setInput('')}
              className="-mr-3 flex size-10 flex-none items-center justify-center text-icon-muted"
            >
              <X className="size-[18px]" />
            </button>
          )}
        </label>

        {notice && (
          <p role="status" className="text-body-sm text-error-fg">
            {notice}
          </p>
        )}

        <HashtagChips tags={draft} onRemove={remove} />

        {failed && (
          <p className="text-body-sm text-text-secondary">
            해시태그를 불러오지 못했어요.{' '}
            <button type="button" onClick={() => void search.refetch()} className="font-semibold underline">
              다시 시도
            </button>
          </p>
        )}

        <ul aria-label="해시태그 목록" className="flex flex-col">
          {top && (
            <TagRow
              name={top.name}
              detail={result?.status === 'NEW' ? '새 해시태그 만들기' : `게시글 ${hashtagCountLabel(top.postCount)}`}
              added={draft.includes(top.name)}
              disabled={failed}
              isNew={result?.status === 'NEW'}
              onAdd={() => add(top.name)}
            />
          )}
          {items.map(tag => (
            <TagRow
              key={tag.name}
              name={tag.name}
              detail={`게시글 ${hashtagCountLabel(tag.postCount)}`}
              added={draft.includes(tag.name)}
              disabled={failed}
              onAdd={() => add(tag.name)}
            />
          ))}
        </ul>
      </div>
    </MobileScreen>
  )
}

function TagRow({
  name,
  detail,
  added,
  disabled,
  isNew = false,
  onAdd,
}: {
  name: string
  detail: string
  added: boolean
  disabled: boolean
  isNew?: boolean
  onAdd: () => void
}) {
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onAdd}
        disabled={added || disabled}
        aria-label={`#${name} ${detail} ${added ? '추가됨' : '추가'}`}
        className="flex w-full items-center gap-3 py-3 text-left focus-visible:outline-none focus-visible:shadow-focus-ring"
      >
        <span className="flex size-9 flex-none items-center justify-center rounded-full bg-surface-sunken text-icon">
          {isNew ? <Plus className="size-5" /> : <Hash className="size-5" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`truncate text-label font-medium ${isNew ? 'text-text-brand' : 'text-text-primary'}`}>
            #{name}
          </span>
          <span className="text-caption text-text-tertiary">{detail}</span>
        </span>
        <span className={`flex items-center gap-1 text-body-sm ${added ? 'text-text-tertiary' : 'text-text-brand'}`}>
          {added && <Check className="size-4" />}
          {added ? '추가됨' : '추가'}
        </span>
      </button>
    </li>
  )
}
