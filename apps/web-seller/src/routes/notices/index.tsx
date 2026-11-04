import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Alert, Button, FilterBar, PageHeader, Select } from '@aechak/design-system/web'
import {
  CATEGORY_ANY,
  NoticeDetailDrawer,
  NoticesTable,
  NotificationChannelCard,
  noticeListErrorMessage,
  NOTICE_CATEGORIES,
  NOTICE_CATEGORY_LABEL,
  useSellerNoticeDetail,
  useSellerNotices,
  type NoticeCategory,
} from '@/features/notices'
import { SAMPLE_ACTION_TOAST } from '@/shared/components/SampleDataNotice'
import { useToast } from '@/shared/hooks/useToast'

export const Route = createFileRoute('/notices/')({
  component: NoticesRoute,
})

/**
 * 알림/공지 — 셀러 nav에 처음부터 있던 항목이고 SCRUM-301이 라우트 파일을 신설했다.
 *
 * SCRUM-307이 예시 데이터로 화면을 채웠고, SCRUM-332에서 seller 호스트에
 * `GET /sellers/me/notices`와 `GET /sellers/me/notices/{noticeId}`가 열려 **실서버로 바꿨다**.
 * 그래서 공지 쪽 예시 데이터와 "예시 데이터" 띠, nav의 "준비 중" 꼬리표를 떼었다 — 어드민이
 * 게시한 공지가 이제 여기로 내려온다.
 *
 * **지운 것 둘**: 읽음/안 읽음 탭과 보낸 곳 컬럼이다. 서버에 열람 기록 테이블이 없어 읽음 여부가
 * 응답에 없고(있는 것처럼 그리면 읽은 표시가 영구히 안 바뀐다), 보낸 운영자도 독자에게는 내려오지
 * 않는다. 그 자리는 분류 필터와 본문 미리보기가 대신한다.
 *
 * 아래 **알림 수신 설정 카드만 예시로 남는다** — 발송 채널 설정 경로가 서버에 없고, 저장되지
 * 않는다는 사실은 카드 안의 글자가 말한다(`notices.mock.ts` 머리에 실측이 있다).
 */

const CATEGORY_OPTIONS = [
  { value: CATEGORY_ANY, label: '전체 분류' },
  ...NOTICE_CATEGORIES.map(value => ({ value, label: NOTICE_CATEGORY_LABEL[value] })),
]

function NoticesRoute() {
  const [category, setCategory] = useState<NoticeCategory | typeof CATEGORY_ANY>(CATEGORY_ANY)
  const [openId, setOpenId] = useState<string | null>(null)
  const toast = useToast()

  const list = useSellerNotices({ category })
  const detail = useSellerNoticeDetail(openId)

  return (
    <div className="p-6">
      <PageHeader title="알림/공지" />

      {/* 조회 실패를 "조건에 맞는 공지가 없어요"로 흘리지 않는다 — 실 API에는 403/10004(셀러
          아님)·400/90002(커서)·500이 있고 그 전부가 빈 목록으로 보이면 셀러는 공지가 없다고 읽는다
          (AGENTS.md 규약 7). 재조회 실패 시에는 직전 목록이 남으므로 그 사실도 함께 밝힌다. */}
      {list.isError && (
        <Alert variant="error" title="공지를 불러오지 못했어요" className="mb-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="min-w-0 flex-1">
              {noticeListErrorMessage(list.error)}
              {list.notices.length > 0 &&
                ' 아래 목록은 마지막으로 불러온 내용이라 지금과 다를 수 있어요.'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              loading={list.isFetching}
              onClick={list.refetch}
            >
              다시 시도
            </Button>
          </div>
        </Alert>
      )}

      <FilterBar>
        <Select
          aria-label="공지 분류"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={value => setCategory(value as NoticeCategory | typeof CATEGORY_ANY)}
        />
        <Button variant="ghost" size="md" onClick={() => setCategory(CATEGORY_ANY)}>
          초기화
        </Button>
      </FilterBar>

      {/* 총건수는 첫 페이지에만 실린다 — 커서 페이지의 null로 덮으면 숫자가 사라진다. */}
      <p className="mt-4 text-caption text-text-tertiary">
        총 {list.totalCount == null ? '—' : list.totalCount.toLocaleString()}건
      </p>

      <div className="mt-2">
        <NoticesTable
          notices={list.notices}
          loading={list.isLoading}
          // 실패를 빈 상태 문구로 흘리지 않는다(위 Alert이 이유를 말한다).
          emptyLabel={list.isError ? '공지를 불러오지 못했어요.' : undefined}
          onOpen={setOpenId}
        />
      </div>

      {list.hasNext && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="secondary"
            size="md"
            loading={list.isFetchingNextPage}
            onClick={list.fetchNextPage}
          >
            더 보기
          </Button>
        </div>
      )}

      <p className="mt-3.5 text-caption text-text-tertiary">
        고정 공지가 먼저 오고 그 다음 최근 게시순이에요. 행을 누르면 공지 전문을 볼 수 있어요.
      </p>

      <div className="mt-5">
        <NotificationChannelCard onSave={() => toast.show(SAMPLE_ACTION_TOAST, 'info')} />
      </div>

      <NoticeDetailDrawer
        open={openId !== null}
        notice={detail.notice}
        isLoading={detail.isLoading}
        isError={detail.isError}
        error={detail.error}
        onClose={() => setOpenId(null)}
      />

      {toast.element}
    </div>
  )
}
