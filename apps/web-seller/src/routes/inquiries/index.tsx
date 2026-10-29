import { createFileRoute } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/inquiries/')({
  component: InquiriesRoute,
})

/**
 * 셀러 nav에는 "고객 문의"가 처음부터 있었지만 라우트 파일은 한 번도
 * 만들어진 적이 없어 메뉴만 되살리면 404로 갔다 — 자리를 만들고 안내를 둔다.
 *
 * BE 실측(2026-10-26, dev 스펙 전수): 구매자 호스트에 `POST /api/v1/inquiries`(접수)만 있고
 * 셀러가 **받은** 문의를 읽거나 답변하는 경로는 seller 호스트에 없다. 목록 조회·답변 전송이
 * 생기면 이 안내 대신 실화면을 그린다.
 */
function InquiriesRoute() {
  return (
    <UnavailableScreen
      title="고객 문의"
      message="고객 문의는 준비 중이에요"
      description="구매자가 보낸 문의를 확인하고 답변하는 화면이에요. 서버가 준비되면 열어 둘게요."
      upcoming={[
        {
          label: '받은 문의 목록',
          description: '상품/주문별로 받은 문의를 최신 순으로 보고, 아직 답변하지 않은 건을 먼저 띄워요.',
        },
        {
          label: '답변 작성',
          description: '문의를 열어 답변을 쓰고 보낸 뒤 상태를 답변 완료로 바꿔요.',
        },
        {
          label: '답변 기한',
          description: '기한이 지난 미답변 문의를 따로 모아 보여줘요.',
        },
      ]}
    />
  )
}
