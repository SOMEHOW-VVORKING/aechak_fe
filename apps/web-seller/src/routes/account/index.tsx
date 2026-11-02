import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, PageHeader, StatusPill } from '@aechak/design-system/web'
import {
  AccountInfoForm,
  LoginHistoryTable,
  MemberList,
  SecuritySettingsCard,
} from '@/features/account'
import { SAMPLE_ACTION_TOAST, SampleDataNotice } from '@/shared/components/SampleDataNotice'
import { useToast } from '@/shared/hooks/useToast'

export const Route = createFileRoute('/account/')({
  component: AccountRoute,
})

/**
 * 계정/보안 — 셀러 nav에 처음부터 있던 항목이고 SCRUM-301이 라우트 파일을 신설했다.
 *
 * SCRUM-307에서 **안내만 있던 화면을 예시 데이터로 채웠다**(`UnavailableScreen` → 계정 정보 폼 +
 * 보안 설정 + 접속 기록 + 담당자 목록). 지운 것은 없고, 저장되지 않는다는 사실은 상단
 * `SampleDataNotice` 띠가 말한다. "스토어 설정으로" 안내 버튼은 그대로 남긴다 — 사업자 정보와
 * 제출 서류, 승인 뒤의 스토어 상호·소개·주소는 지금도 그 화면에서 **실제로** 저장된다.
 *
 * 예시 데이터와 BE가 생겼을 때의 교체 방법은 `features/account/account.mock.ts` 머리에 있다.
 */
function AccountRoute() {
  const navigate = useNavigate()
  const toast = useToast()
  const notSent = () => toast.show(SAMPLE_ACTION_TOAST, 'info')

  return (
    <div className="p-6">
      <PageHeader
        title="계정/보안"
        actions={
          <>
            <StatusPill variant="muted">준비 중</StatusPill>
            <Button
              variant="secondary"
              size="md"
              onClick={() => void navigate({ to: '/store-settings' })}
            >
              스토어 설정으로
            </Button>
          </>
        }
      />

      <SampleDataNotice
        replaceWhen={
          <>
            seller 호스트에 <strong>GET /sellers/me/account</strong>와 비밀번호/2단계 인증/접속 기록
            경로가 생기면 내 계정의 실제 값으로 바뀌어요. 사업자 정보와 제출 서류, 스토어 상호·소개·
            주소는 지금도 스토어 설정에서 저장돼요.
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <AccountInfoForm onSave={notSent} />

        <SecuritySettingsCard onChangePassword={notSent} onToggleMfa={notSent} />

        <section>
          <h2 className="mb-2 text-subheading font-semibold text-text-primary">접속 기록</h2>
          <LoginHistoryTable />
          <p className="mt-2.5 text-caption text-text-tertiary">
            낯선 접속이 보이면 비밀번호를 바꾸고 2단계 인증을 켜 주세요.
          </p>
        </section>

        <MemberList onInvite={notSent} />
      </div>

      {toast.element}
    </div>
  )
}
