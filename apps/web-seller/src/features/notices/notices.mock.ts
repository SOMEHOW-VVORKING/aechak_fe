/**
 * 알림 **수신 설정** 카드의 예시 데이터 — 화면 파일에 인라인하지 않는다(레포 관례).
 *
 * 공지 목록의 예시 데이터(`SAMPLE_NOTICES`)는 SCRUM-332에서 지웠다. seller 호스트에
 * `GET /sellers/me/notices`와 `GET /sellers/me/notices/{noticeId}`가 열려 실서버에 붙었고,
 * 어드민이 게시한 공지가 그대로 내려온다(`notices.queries.ts`).
 *
 * 남은 것은 발송 채널 설정뿐이다. **실측(2026-11-03)**: seller 호스트 47경로에 수신 설정을 읽거나
 * 저장하는 경로가 없고, 플랫폼의 발송 구현은 둘뿐이다 — 구매자 휴대폰 인증 코드(SMS)와 앱 서비스
 * 문의 접수를 **운영팀 메일함**으로 보내는 리스너(`InquiryNotificationListener`)다. 셀러에게
 * 주문·정산을 알리는 경로는 없다. 그래서 이 카드만 예시로 남고, 저장되지 않는다는 사실은 카드
 * 안의 글자가 말한다(화면 상단 띠는 실연동 목록을 예시로 의심하게 만들어 떼었다 — AGENTS 규약 10).
 *
 * **BE가 생기면**: `GET`·`PUT /sellers/me/notification-settings`가 열리면 이 상수 자리에 그 응답을
 * 넣고 저장을 PUT에 연결한 뒤 카드 안의 "저장되지 않아요" 문구를 지운다.
 */

export type NotificationEvent = 'NEW_ORDER' | 'CLAIM' | 'SETTLEMENT' | 'INQUIRY'

export interface NotificationChannelSetting {
  event: NotificationEvent
  label: string
  description: string
  email: boolean
  sms: boolean
}

export const SAMPLE_NOTIFICATION_CHANNELS: NotificationChannelSetting[] = [
  {
    event: 'NEW_ORDER',
    label: '신규 주문',
    description: '결제가 끝난 주문이 들어오면 알려 드려요.',
    email: true,
    sms: true,
  },
  {
    event: 'CLAIM',
    label: '취소/반품/교환',
    description: '구매자가 클레임을 접수하면 알려 드려요.',
    email: true,
    sms: false,
  },
  {
    event: 'SETTLEMENT',
    label: '정산 지급',
    description: '월 정산이 확정되거나 지급되면 알려 드려요.',
    email: true,
    sms: false,
  },
  {
    event: 'INQUIRY',
    label: '고객 문의',
    description: '답변하지 않은 문의가 하루 이상 지나면 알려 드려요.',
    email: false,
    sms: false,
  },
]
