import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { UnavailableScreen } from '@/shared/components/UnavailableScreen'

export const Route = createFileRoute('/account/')({
  component: AccountRoute,
})

/**
 * 셀러 nav에는 "계정/보안"이 처음부터 있었지만 라우트 파일은 한 번도
 * 만들어진 적이 없어 메뉴만 되살리면 404로 갔다 — 자리를 만들고 안내를 둔다.
 *
 * BE 실측(2026-10-26, dev 스펙 전수): seller 호스트의 계정 관련 경로는 `/sellers/me/store`와
 * 입점 신청뿐이고 비밀번호 변경·2단계 인증·접속 기록·담당자 초대 경로가 없다. 구매자 호스트의
 * `/users/me/*`는 구매자 프로필이라 셀러 계정 보안과 다른 도메인이고 호스트도 다르다.
 */
function AccountRoute() {
  const navigate = useNavigate()

  return (
    <UnavailableScreen
      title="계정/보안"
      message="계정/보안은 준비 중이에요"
      description="로그인 정보와 접속 기록을 관리하는 화면이에요. 사업자 정보와 제출 서류는 지금도 스토어 설정에서 보고 고칠 수 있어요."
      action={{
        label: '스토어 설정으로',
        onClick: () => void navigate({ to: '/store-settings' }),
      }}
      upcoming={[
        {
          label: '비밀번호 변경',
          description: '지금 비밀번호를 확인하고 새 비밀번호로 바꿔요.',
        },
        {
          label: '2단계 인증',
          description: '문자/인증 앱으로 받는 2단계 인증을 켜고 꺼요.',
        },
        {
          label: '접속 기록',
          description: '최근 로그인 시각과 기기, 낯선 접속을 봐요.',
        },
        {
          label: '담당자 계정',
          description: '스토어를 함께 운영할 담당자를 초대하고 권한을 나눠요.',
        },
      ]}
    />
  )
}
