import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
// NOTE: '알림 설정' 그룹을 숨기면서 Bell 아이콘 import도 함께 주석 처리(되살릴 때 같이 복원).
import { /* Bell, */ Database, Headphones, HelpCircle, ListChecks, LogOut, ShieldCheck, Smartphone, Users } from 'lucide-react'
import { MobileScreen, Modal, StatusPill } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { endServerSession, logout } from '@/shared/auth'
import { onWishlistLogout } from '@/shared/catalog'
import { resetReviews } from '@/shared/review'
import { APP_VERSION, IS_LATEST_VERSION } from '../settings.mock'
import { SettingsGroup, SettingsNavRow } from './SettingsSection'

// 설정 홈(b11-st-1). 섹션형 설정 목록 + 로그아웃(확인 Modal). 고객센터 문의(b6-st-3)는
// SCRUM-189에서 추가돼 /settings/inquiry로 배선했다. 목업의 본인 인증/펫 프로필/회원 탈퇴/
// 셀러 입점은 각각 다른 배치(Phase 4·범위 밖) 소관이라, 이번 배치가 실제로 소유한 하위 화면으로만
// 실제 이동을 배선한다(존재하지 않는 라우트로의 죽은 nav 금지).
export function SettingsHomeScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [logoutOpen, setLogoutOpen] = useState(false)

  const goBack = useSafeBack({ to: '/mypage' })

  // 서버 세션 종료(RT 무효화 + 쿠키 만료 + access 파기)를 먼저 하고 로컬 상태를 정리한다.
  // endServerSession은 전송 실패를 삼키므로(멱등 204 계약) onSettled 한 곳에서 마무리한다.
  const logoutSession = useMutation({ mutationFn: endServerSession })

  const handleLogout = () => {
    logoutSession.mutate(undefined, {
      onSettled: () => {
        logout()
        // 찜 미러/진행중 동기화/쿼리 캐시를 원자적으로 정리(공유 기기·재진입 대비)
        onWishlistLogout(queryClient)
        // 내가 쓴 리뷰는 서버 캐시가 아니라 클라이언트 스토어 싱글턴이라 queryClient.clear()로는
        // 안 지워진다 — 공유 기기에서 다음 사용자가 /reviews/mine에 들어가면 그대로 보인다.
        resetReviews()
        // 계정 단위 서버 캐시(내 정보/적립금/펫 등)가 다음 사용자에게 새지 않게 전부 비운다.
        queryClient.clear()
        setLogoutOpen(false)
        navigate({ to: '/' })
      },
    })
  }

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="설정" />}>
      <div className="flex flex-col gap-5 p-4">
        {/* 캡틴 지시로 '알림 설정' 진입점을 화면에서 숨김(삭제 아님 — 나중에 되살리기 쉽게 주석 처리).
            라우트(/settings/notifications)는 그대로 두고 진입점만 감춘다. 되살릴 때 상단 Bell import도 함께 복원.
        <SettingsGroup label="알림">
          <SettingsNavRow
            icon={<Bell className="size-5" />}
            label="알림 설정"
            onClick={() => navigate({ to: '/settings/notifications' })}
          />
        </SettingsGroup>
        */}

        <SettingsGroup label="고객지원">
          <SettingsNavRow
            icon={<HelpCircle className="size-5" />}
            label="자주 묻는 질문"
            onClick={() => navigate({ to: '/settings/faq' })}
          />
          <SettingsNavRow
            icon={<Headphones className="size-5" />}
            label="고객센터 문의"
            onClick={() => navigate({ to: '/settings/inquiry' })}
          />
        </SettingsGroup>

        <SettingsGroup label="약관 및 정책">
          <SettingsNavRow
            icon={<ShieldCheck className="size-5" />}
            label="개인정보 처리방침"
            onClick={() => navigate({ to: '/settings/privacy' })}
          />
          <SettingsNavRow
            icon={<Users className="size-5" />}
            label="커뮤니티 가이드라인"
            onClick={() => navigate({ to: '/settings/guidelines' })}
          />
          <SettingsNavRow
            icon={<ListChecks className="size-5" />}
            label="약관 및 개인정보 처리 동의 관리"
            onClick={() => navigate({ to: '/settings/consents' })}
          />
        </SettingsGroup>

        <SettingsGroup label="계정">
          <SettingsNavRow
            icon={<Database className="size-5" />}
            label="계정 및 데이터 삭제 안내"
            onClick={() => navigate({ to: '/settings/data-deletion' })}
          />
        </SettingsGroup>

        <SettingsGroup label="앱 정보">
          <SettingsNavRow
            icon={<Smartphone className="size-5" />}
            label="버전 정보"
            value={
              <span className="flex items-center gap-1.5">
                {APP_VERSION}
                {IS_LATEST_VERSION && <StatusPill variant="neutral" size="sm">최신</StatusPill>}
              </span>
            }
          />
        </SettingsGroup>

        <SettingsGroup>
          <button
            type="button"
            onClick={() => setLogoutOpen(true)}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 px-4 py-2.5 text-body text-text-secondary transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-focus-ring"
          >
            <LogOut className="size-[18px] text-icon" />
            로그아웃
          </button>
        </SettingsGroup>
      </div>

      <Modal
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        title="로그아웃 할까요?"
        description="로그아웃해도 찜/주문 내역은 그대로 남아 있어요."
        confirmLabel="로그아웃"
        cancelLabel="취소"
        onConfirm={handleLogout}
        loading={logoutSession.isPending}
      />
    </MobileScreen>
  )
}
