import { createFileRoute } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/notices/')({
  component: NoticesRoute,
})

/**
 * 셀러 nav에는 "알림/공지"가 처음부터 있었지만 라우트 파일은 한 번도
 * 만들어진 적이 없어 메뉴만 되살리면 404로 갔다 — 자리를 만들고 안내를 둔다.
 *
 * BE 실측(2026-10-26, dev 스펙 전수): seller·admin 호스트 어디에도 공지/알림 경로가 없다
 * (어드민 호스트는 관리자 계정과 셀러 입점 심사 여섯 경로뿐이라 **공지를 보내는 쪽도 없다**).
 * 발신(어드민)과 수신(셀러)이 함께 생겨야 열 수 있는 화면이다.
 */
function NoticesRoute() {
  return (
    <UnavailableScreen
      title="알림/공지"
      message="알림/공지는 준비 중이에요"
      description="운영자가 보낸 공지를 받고 알림을 어디로 받을지 고르는 화면이에요. 서버가 준비되면 열어 둘게요."
      upcoming={[
        {
          label: '공지 목록',
          description: '운영자가 셀러에게 보낸 공지를 최신 순으로 보고 안 읽은 건을 표시해요.',
        },
        {
          label: '알림 수신 설정',
          description: '신규 주문, 클레임, 정산 알림을 메일/문자 중 어디로 받을지 골라요.',
        },
        {
          label: '보낸 알림 기록',
          description: '내 스토어로 발송된 알림을 언제 어떤 경로로 보냈는지 봐요.',
        },
      ]}
    />
  )
}
