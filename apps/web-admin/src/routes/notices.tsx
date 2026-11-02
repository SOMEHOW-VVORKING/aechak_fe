import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ArrowDownCircle,
  Bell,
  CheckCircle,
  Coins,
  FileEdit,
  Megaphone,
  Pin,
  Plus,
  Save,
  Send,
  Wrench,
} from 'lucide-react'
import {
  Alert,
  Button,
  DataTable,
  Drawer,
  FilterBar,
  Input,
  Modal,
  SearchInput,
  Select,
  Textarea,
  Toast,
  Toggle,
} from '@aechak/design-system/web'
import type { Column } from '@aechak/design-system/web'
import {
  allowedTransition,
  detailErrorMessage,
  listErrorMessage,
  saveErrorMessage,
  savedButNotTransitionedMessage,
  toDateTimeLabel,
  useAdminNoticeDetail,
  useAdminNotices,
  useNoticeTransition,
  useSaveNotice,
  AUDIENCE_ANY,
  NOTICE_AUDIENCES,
  NOTICE_AUDIENCE_LABELS,
  NOTICE_CATEGORIES,
  NOTICE_CATEGORY_LABELS,
  NOTICE_STATUSES,
  NOTICE_STATUS_LABELS,
  type AdminNoticeDetailView,
  type AdminNoticeRow,
  type NoticeAudienceValue,
  type NoticeCategoryValue,
  type NoticeStatusValue,
} from '@/features/notices'
import { DetailDrawerBody } from '@/shared/components/DetailDrawerBody'
import { DetailField } from '@/shared/components/DetailField'
import { DrawerSummaryCard } from '@/shared/components/DrawerSummaryCard'
import { FilterSelect } from '@/shared/components/FilterSelect'
import { PageIntro } from '@/shared/components/PageIntro'
import { RowLinkButton } from '@/shared/components/RowLinkButton'
import { StatusMetaPill } from '@/shared/components/StatusMetaPill'
import type { StatusMeta } from '@/shared/components/StatusMetaPill'
import { SummaryGrid } from '@/shared/components/SummaryGrid'

// `/admin/notices` 여섯(목록·초안 생성·상세·수정·게시·내림)이 dev에 올라와 실연동이다(SCRUM-332).
// **서버는 알림을 보내지 않는다** — 발송 어댑터가 플랫폼에 없어 푸시 여부·도달 수 필드도 없다.
// 그래서 이 화면에는 발송 관련 입력·표시가 하나도 없다(목 시절에는 토글·컬럼·pill·Modal 문구가
// 있었고, 그대로 실연동하면 운영자가 "알림으로 알렸다"고 믿게 된다).
export const Route = createFileRoute('/notices')({
  component: NoticesPage,
})

const statusMeta: Record<NoticeStatusValue, StatusMeta> = {
  DRAFT: { label: NOTICE_STATUS_LABELS.DRAFT, variant: 'muted', icon: FileEdit },
  PUBLISHED: { label: NOTICE_STATUS_LABELS.PUBLISHED, variant: 'success', icon: CheckCircle },
  UNPUBLISHED: {
    label: NOTICE_STATUS_LABELS.UNPUBLISHED,
    variant: 'neutral',
    icon: ArrowDownCircle,
  },
}

const categoryMeta: Record<NoticeCategoryValue, StatusMeta> = {
  SERVICE: { label: NOTICE_CATEGORY_LABELS.SERVICE, variant: 'neutral', icon: Megaphone },
  MAINTENANCE: { label: NOTICE_CATEGORY_LABELS.MAINTENANCE, variant: 'warning', icon: Wrench },
  POLICY: { label: NOTICE_CATEGORY_LABELS.POLICY, variant: 'info', icon: FileEdit },
  EVENT: { label: NOTICE_CATEGORY_LABELS.EVENT, variant: 'accent', icon: Bell },
  SETTLEMENT: { label: NOTICE_CATEGORY_LABELS.SETTLEMENT, variant: 'brand', icon: Coins },
}

/**
 * 서버가 열거를 늘린 날 셀이 통째로 터지지 않게 원문으로 떨어진다(`metaOf` 관례).
 *
 * `StatusMetaPill`이 `{ meta: { label, variant, icon } }`로 구조분해하므로 표에서 값 하나가 빠지면
 * TypeError가 나 **목록 전체가 사라진다** — 정산 공지 한 건이 화면을 날리는 모양이 실제로 있었다.
 */
const metaOf = <T extends string>(table: Record<T, StatusMeta>, value: T): StatusMeta =>
  (table as Record<string, StatusMeta | undefined>)[value] ?? { label: value, variant: 'neutral' }

const statusFilterOptions = [
  { value: 'all', label: '게시 상태 전체' },
  ...NOTICE_STATUSES.map(value => ({ value, label: NOTICE_STATUS_LABELS[value] })),
]

/**
 * 대상 필터의 "미선택" 센티넬은 `'all'`이 아니라 `AUDIENCE_ANY`다.
 *
 * 이 축에는 `'ALL'`이 **실제 값**으로 있다(전체 회원 대상 공지) — 다른 어드민 화면의 `'all'` 관례를
 * 그대로 쓰면 "전체 대상"을 골라도 미선택으로 읽혀 서버로 `audience`가 나가지 않고, 운영자는 전체
 * 목록을 보면서 걸러진 것으로 읽는다.
 */
const audienceFilterOptions = [
  { value: AUDIENCE_ANY, label: '대상 전체' },
  ...NOTICE_AUDIENCES.map(value => ({
    value,
    label: `${NOTICE_AUDIENCE_LABELS[value]} 대상`,
  })),
]

const audienceSelectOptions = NOTICE_AUDIENCES.map(value => ({
  value,
  label: NOTICE_AUDIENCE_LABELS[value],
}))

/** 분류는 생성·수정의 필수 필드라 미선택 자리를 둔다 — 고르지 않으면 요청을 만들 수 없다. */
const categorySelectOptions = NOTICE_CATEGORIES.map(value => ({
  value,
  label: NOTICE_CATEGORY_LABELS[value],
}))

const isCategory = (value: string): value is NoticeCategoryValue =>
  (NOTICE_CATEGORIES as string[]).includes(value)

const transitionMeta = {
  publish: {
    actionLabel: '게시하기',
    title: '공지를 게시할까요?',
    description: '저장한 내용이 바로 공지 목록에 노출돼요. 내리기로 되돌릴 수 있어요.',
    successToast: '공지를 저장하고 게시했어요.',
  },
  unpublish: {
    actionLabel: '내리기',
    title: '공지를 내릴까요?',
    description: '공지 목록에서 바로 사라져요. 다시 게시할 수 있어요.',
    successToast: '공지를 저장하고 내렸어요.',
  },
} satisfies Record<'publish' | 'unpublish', Record<string, string>>

function makeNoticeColumns(
  onOpenDetail: (row: AdminNoticeRow) => void,
): Column<AdminNoticeRow>[] {
  return [
    {
      key: 'title',
      label: '제목',
      render: row => (
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5">
            {row.pinned && <Pin className="size-3.5 flex-none text-brand" />}
            <RowLinkButton onClick={() => onOpenDetail(row)}>{row.title}</RowLinkButton>
          </span>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {NOTICE_AUDIENCE_LABELS[row.audience] ?? row.audience} 대상
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      label: '분류',
      align: 'center',
      render: row => <StatusMetaPill meta={metaOf(categoryMeta, row.category)} />,
    },
    {
      // 서버 정렬은 `createdAt` 내림차순 고정이고 `publishedAt`은 초안에서 null이다 — 게시 시각만
      // 그리면 초안 행이 빈 칸이 되고, 눈에 보이는 순서와 그리는 시각이 서로 다른 값이 된다.
      key: 'publishedAt',
      label: '시각',
      align: 'right',
      render: row => (
        <div>
          <p className="text-body-sm text-text-primary tabular-nums">
            {toDateTimeLabel(row.publishedAt ?? row.createdAt)}
          </p>
          <p className="mt-0.5 text-caption text-text-tertiary">
            {row.publishedAt == null ? '등록' : '게시'}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      label: '게시 상태',
      align: 'center',
      render: row => <StatusMetaPill meta={metaOf(statusMeta, row.status)} />,
    },
  ]
}

function NoticesPage() {
  // 필터는 전부 서버 파라미터다 — 메모리 필터를 남기면 불러온 페이지 안에서만 걸러지고 운영자는
  // 걸러진 전체를 봤다고 읽는다. 분류 축은 열에 보이고 공지 규모에서 없어도 거짓을 읽지 않아 두지 않는다.
  const [statusFilter, setStatusFilter] = useState<NoticeStatusValue | 'all'>('all')
  const [audienceFilter, setAudienceFilter] = useState<NoticeAudienceValue | typeof AUDIENCE_ANY>(
    AUDIENCE_ANY,
  )
  const [search, setSearch] = useState('')
  const list = useAdminNotices({
    status: statusFilter,
    audience: audienceFilter,
    keyword: search,
  })

  // 드로어 모드를 명시한다 — 생성 폼과 수정 폼이 state를 공유하면 생성이 직전에 열어 둔 공지 값으로
  // 오염되거나 반대로 수정이 빈 값으로 나간다.
  const [mode, setMode] = useState<'create' | 'edit' | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const detail = useAdminNoticeDetail(selectedId)
  const save = useSaveNotice()
  const transition = useNoticeTransition()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('')
  const [audience, setAudience] = useState<NoticeAudienceValue>('ALL')
  const [pinned, setPinned] = useState(false)
  const [internalMemo, setInternalMemo] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const notice = detail.notice
  // 상세가 도착한 뒤 한 번만 시드한다 — 매 렌더 재시딩하면 운영자가 고친 값이 되돌아간다.
  useEffect(() => {
    if (!notice) return
    setTitle(notice.title)
    setContent(notice.content)
    setCategory(notice.category)
    setAudience(notice.audience)
    setPinned(notice.pinned)
    setInternalMemo(notice.internalMemo ?? '')
  }, [notice?.noticeId])

  function openCreate() {
    setMode('create')
    setSelectedId(null)
    setTitle('')
    setContent('')
    setCategory('')
    setAudience('ALL')
    setPinned(false)
    setInternalMemo('')
  }

  /**
   * 폼을 행 값으로 미리 채우지 않는다 — 목록 summary에는 `content`·`internalMemo`가 없어서,
   * 행으로 채우면 본문이 빈 폼이 뜨고 그대로 저장하면 **빈 내용으로 PUT**이 나가 공지 본문이
   * 지워진다. 폼은 상세가 도착한 뒤 위 effect가 채우고, 그동안 폼 자체를 그리지 않는다.
   */
  function openEdit(row: AdminNoticeRow) {
    setMode('edit')
    setSelectedId(row.noticeId)
  }

  const busy = save.isPending || transition.isPending

  /**
   * 요청이 떠 있는 동안에는 드로어도 확인 Modal도 닫지 않는다.
   *
   * DS `Drawer`/`Modal`은 ESC·스크림·취소를 전부 `onClose` 하나로 보낸다 — 닫히면 react-query가
   * 호출별 `onSuccess`/`onError`를 실행하지 않아 게시는 서버에 들어가고 결과만 사라진다.
   */
  function closeDrawer() {
    if (busy) return
    setMode(null)
    setSelectedId(null)
    setConfirmOpen(false)
  }

  // 편집 폼이 서버 상태를 다 갖췄는지. 생성 모드에는 상세 조회가 없다(skipToken).
  const formLoaded = mode === 'create' || (notice != null && !detail.isError)
  const formFilled = title.trim() !== '' && content.trim() !== '' && isCategory(category)
  // 조회가 실패·대기 중인 상세로는 쓰기를 만들지 않는다(AGENTS 6-7) — 확인 Modal과 PUT 본문이
  // 둘 다 상세 값으로 만들어지므로, 본문을 받지 못한 채 저장하면 빈 내용으로 공지를 덮어쓴다.
  const canSubmit = formLoaded && formFilled && !busy

  function saveBody() {
    const memo = internalMemo.trim()
    return {
      title: title.trim(),
      content: content.trim(),
      category: category as NoticeCategoryValue,
      audience,
      pinned,
      ...(memo === '' ? {} : { internalMemo: memo }),
    }
  }

  function submitSave() {
    if (!canSubmit) return
    save.mutate(
      { noticeId: selectedId, body: saveBody() },
      {
        onSuccess: () => {
          setToast(mode === 'create' ? '공지 초안을 만들었어요.' : '공지 내용을 저장했어요.')
          closeDrawer()
        },
        onError: error => setToast(saveErrorMessage(error)),
      },
    )
  }

  const action = notice ? allowedTransition(notice.status) : null

  /**
   * 저장과 상태 변경은 **두 요청**이고 순서가 PUT → publish/unpublish다(BE가 그 순서를 못박았다).
   *
   * 한 요청처럼 묶으면 PUT이 들어가고 전이가 실패한 구간에서 어느 쪽이 반영됐는지 알 수 없다 —
   * 그 구간은 "내용은 저장됐고 게시는 안 됐다"를 한 문장으로 말해야 운영자가 같은 내용을 다시 쓰지
   * 않는다. 전이만 보내고 저장을 생략하지 않는 이유는, 그러면 화면에 보이는 편집 내용이 조용히
   * 버려진 채로 공지가 게시되기 때문이다.
   */
  function submitTransition() {
    if (!canSubmit || selectedId == null || action == null) return
    const meta = transitionMeta[action]
    save.mutate(
      { noticeId: selectedId, body: saveBody() },
      {
        onSuccess: () => {
          transition.mutate(
            { noticeId: selectedId, action },
            {
              onSuccess: () => {
                setToast(meta.successToast)
                closeDrawer()
              },
              onError: error => {
                setToast(savedButNotTransitionedMessage(error, action))
                setConfirmOpen(false)
              },
            },
          )
        },
        onError: error => {
          setToast(saveErrorMessage(error))
          setConfirmOpen(false)
        },
      },
    )
  }

  return (
    <div className="p-6">
      <PageIntro title="알림/공지 관리" description="서비스 공지를 등록하고 게시해요." />

      {/* 목록 실패를 빈 상태로 떨어뜨리지 않는다 — "공지 없음"과 "못 불러옴"이 구분되지 않는다. */}
      {list.isError && (
        <Alert variant="error" title="목록을 불러오지 못했어요" className="mb-5">
          <p>{listErrorMessage(list.error)}</p>
        </Alert>
      )}

      <div className="mb-3.5 flex items-start justify-between gap-2">
        <FilterBar className="flex-1">
          <FilterSelect
            options={statusFilterOptions}
            value={statusFilter}
            onChange={value => setStatusFilter(value as NoticeStatusValue | 'all')}
          />
          <FilterSelect
            options={audienceFilterOptions}
            value={audienceFilter}
            onChange={value => setAudienceFilter(value as NoticeAudienceValue | typeof AUDIENCE_ANY)}
            narrow
          />
          {/* 서버 `keyword`는 제목 부분일치만 본다 — 내용까지 찾는다고 적으면 거짓 주장이 된다. */}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="공지 제목 검색"
            className="w-64"
          />
        </FilterBar>
        <Button leftIcon={<Plus className="size-4" />} onClick={openCreate}>
          새 공지
        </Button>
      </div>

      <DataTable
        columns={makeNoticeColumns(openEdit)}
        rows={list.rows}
        rowKey={row => row.noticeId}
        onRowClick={openEdit}
        loading={list.isLoading}
        emptyLabel={list.isError ? '목록을 불러오지 못했어요.' : '조건에 맞는 공지가 없어요.'}
      />

      {list.hasNext && (
        <div className="mt-3.5 flex justify-center">
          <Button
            variant="secondary"
            onClick={list.fetchNextPage}
            disabled={list.isFetchingNextPage}
          >
            {list.isFetchingNextPage ? '불러오는 중' : '더 보기'}
          </Button>
        </div>
      )}

      <Drawer
        open={mode !== null}
        onClose={closeDrawer}
        title={mode === 'create' ? '새 공지' : '공지 상세'}
        width="lg"
      >
        {mode === 'edit' && detail.isLoading && (
          <p className="text-body-sm text-text-tertiary">공지 내용을 불러오고 있어요.</p>
        )}
        {mode === 'edit' && detail.isError && (
          <Alert variant="error" title="공지를 불러오지 못했어요">
            <p>{detailErrorMessage(detail.error)}</p>
          </Alert>
        )}
        {(mode === 'create' || (mode === 'edit' && notice != null)) && (
          <NoticeForm
            notice={mode === 'edit' ? notice : null}
            action={mode === 'edit' ? action : null}
            canSubmit={canSubmit}
            saving={save.isPending}
            onSaveClick={submitSave}
            onTransitionClick={() => setConfirmOpen(true)}
            title={title}
            onTitleChange={setTitle}
            content={content}
            onContentChange={setContent}
            category={category}
            onCategoryChange={setCategory}
            audience={audience}
            onAudienceChange={setAudience}
            pinned={pinned}
            onPinnedChange={setPinned}
            internalMemo={internalMemo}
            onInternalMemoChange={setInternalMemo}
          />
        )}
      </Drawer>

      {action != null && (
        <Modal
          open={confirmOpen}
          onClose={() => {
            if (busy) return
            setConfirmOpen(false)
          }}
          title={transitionMeta[action].title}
          description={transitionMeta[action].description}
          confirmLabel={transitionMeta[action].actionLabel}
          onConfirm={submitTransition}
          loading={busy}
        >
          <SummaryGrid
            items={[
              { label: '제목', value: title },
              { label: '대상', value: NOTICE_AUDIENCE_LABELS[audience] },
            ]}
          />
        </Modal>
      )}

      {toast && <Toast open onClose={() => setToast(null)} message={toast} variant="info" />}
    </div>
  )
}

interface NoticeFormProps {
  /** 생성 모드에서는 null이다 — 상태 pill·식별자·전이 버튼이 그때만 빠진다. */
  notice: AdminNoticeDetailView | null
  action: 'publish' | 'unpublish' | null
  canSubmit: boolean
  saving: boolean
  onSaveClick: () => void
  onTransitionClick: () => void
  title: string
  onTitleChange: (value: string) => void
  content: string
  onContentChange: (value: string) => void
  category: string
  onCategoryChange: (value: string) => void
  audience: NoticeAudienceValue
  onAudienceChange: (value: NoticeAudienceValue) => void
  pinned: boolean
  onPinnedChange: (value: boolean) => void
  internalMemo: string
  onInternalMemoChange: (value: string) => void
}

function NoticeForm({
  notice,
  action,
  canSubmit,
  saving,
  onSaveClick,
  onTransitionClick,
  title,
  onTitleChange,
  content,
  onContentChange,
  category,
  onCategoryChange,
  audience,
  onAudienceChange,
  pinned,
  onPinnedChange,
  internalMemo,
  onInternalMemoChange,
}: NoticeFormProps) {
  return (
    <DetailDrawerBody
      subtitle={
        notice
          ? `${notice.noticeId} / ${toDateTimeLabel(notice.publishedAt ?? notice.createdAt)} ${notice.publishedAt == null ? '등록' : '게시'}`
          : '저장하면 초안으로 만들어져요. 게시는 목록에서 다시 열어 눌러요.'
      }
      actions={
        <>
          <Button
            variant={action == null ? 'primary' : 'secondary'}
            leftIcon={<Save className="size-4" />}
            onClick={onSaveClick}
            disabled={!canSubmit}
            loading={saving}
          >
            저장
          </Button>
          {/* 게시 중 행에는 게시 버튼을 두지 않는다 — 재게시는 409(150006)라 못 쓰는 버튼이 된다. */}
          {action != null && (
            <Button
              variant="primary"
              leftIcon={
                action === 'publish' ? (
                  <Send className="size-4" />
                ) : (
                  <ArrowDownCircle className="size-4" />
                )
              }
              onClick={onTransitionClick}
              disabled={!canSubmit}
            >
              {transitionMeta[action].actionLabel}
            </Button>
          )}
        </>
      }
    >
      {notice && (
        <DrawerSummaryCard
          pills={
            <>
              <StatusMetaPill meta={metaOf(statusMeta, notice.status)} />
              <StatusMetaPill meta={metaOf(categoryMeta, notice.category)} />
            </>
          }
        >
          <SummaryGrid
            items={[
              { label: '등록 시각', value: toDateTimeLabel(notice.createdAt) },
              {
                label: '게시 시각',
                value: notice.publishedAt == null ? '게시한 적 없어요' : toDateTimeLabel(notice.publishedAt),
              },
              { label: '마지막 수정', value: toDateTimeLabel(notice.updatedAt) },
              { label: '공지 ID', value: notice.noticeId },
            ]}
          />
        </DrawerSummaryCard>
      )}

      <DetailField label="제목" visibility="visible-to-user">
        <Input value={title} maxLength={200} onChange={event => onTitleChange(event.target.value)} />
      </DetailField>

      <DetailField label="내용" visibility="visible-to-user">
        <Textarea value={content} onChange={onContentChange} maxLength={2000} rows={6} />
      </DetailField>

      {/* 분류는 생성·수정 둘 다의 필수 필드다 — 입력이 없으면 초안을 만들 수도, 분류를 바꿀 수도 없다. */}
      <DetailField label="분류">
        <Select
          options={categorySelectOptions}
          placeholder="분류 선택"
          value={category}
          onChange={onCategoryChange}
        />
      </DetailField>

      <DetailField label="노출 대상">
        <Select
          options={audienceSelectOptions}
          value={audience}
          onChange={value => onAudienceChange(value as NoticeAudienceValue)}
        />
      </DetailField>

      {/* 서버에 있는 노출 옵션은 `pinned` 하나다(발송 옵션은 계약에 없다). */}
      <DetailField label="노출 옵션">
        <Toggle label="목록 상단에 고정" checked={pinned} onChange={onPinnedChange} />
      </DetailField>

      <DetailField label="내부 메모" visibility="internal-only">
        <Textarea
          value={internalMemo}
          onChange={onInternalMemoChange}
          maxLength={300}
          rows={3}
          placeholder="내부 공유용 메모를 입력하세요."
        />
      </DetailField>
    </DetailDrawerBody>
  )
}
