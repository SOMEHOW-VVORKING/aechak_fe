import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { Alert, Modal } from '@aechak/design-system/web'
import { useLogout } from '../auth.queries'

/**
 * SideNav 하단 로그아웃 진입점(`routes/__root.tsx`가 AppShell에 주입).
 *
 * 확인 한 단계를 두는 것은 구매자 앱 설정 홈과 같은 모양이다 — 되돌릴 수 없는 조치는 아니지만
 * 실수로 눌리면 다시 로그인해야 하고, 데모 중에는 그게 흐름이 끊기는 것이다.
 *
 * 문구에 "구매자 앱과 어드민도 영향을 받는다"를 적는 이유는 그것이 실제 동작이기 때문이다.
 * refresh 쿠키는 Domain 없이 api 호스트에 묶여(`Path=/api/v1/auth`) 세 웹앱이 같은 쿠키 하나를
 * 쓰고, 서버 로그아웃은 그 refresh 토큰 자체를 폐기한다(BE `WebAuthController.logout`). 적어
 * 두지 않으면 운영자는 옆 탭의 구매자 앱이 끊긴 것을 장애로 읽는다.
 *
 * 다만 **"다른 앱도 지금 로그아웃된다"고 쓰지 않는다** — 쿠키와 서버 세션만 사라지고, 이미 열려
 * 있는 다른 탭의 메모리 access 토큰과 로그인 플래그는 이 앱이 건드릴 수 없다. 그 탭은 새로
 * 고치거나 토큰이 만료되는 시점에 로그인 화면으로 떨어진다. 그래서 "새로 고치면 다시 로그인해야
 * 한다"까지만 약속한다(지금 끊긴다고 쓰면 거짓이다).
 */
export function LogoutButton() {
  const [open, setOpen] = useState(false)
  const logout = useLogout()

  // 닫을 때 실패 상태를 지운다 — 남겨 두면 다시 열었을 때 방금 실패한 것처럼 보인다.
  // 전송 중에는 닫지 않는다(어드민 발송 독촉 Modal과 같은 처리) — 스크림·Escape·취소가 닫아도
  // 요청은 계속 날아가는데 `reset()`이 진행 중 mutation에서 옵저버를 떼어, 실패해도 안내가 뜰
  // 자리가 없고 다시 열면 확인 버튼이 되살아나 두 번째 요청이 나간다.
  const close = () => {
    if (logout.isPending) return
    setOpen(false)
    logout.reset()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-left text-body-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:shadow-focus-ring focus-visible:outline-none"
      >
        <LogOut className="size-5 flex-none text-icon" />
        <span className="flex-1 truncate">로그아웃</span>
      </button>

      <Modal
        open={open}
        onClose={close}
        title="로그아웃할까요?"
        description="구매자 앱/셀러센터/어드민이 로그인 쿠키 하나를 함께 써요. 여기서 로그아웃하면 그 쿠키가 지워져서, 같은 브라우저의 구매자 앱과 어드민도 새로 고치면 다시 로그인해야 해요."
        confirmLabel="로그아웃"
        cancelLabel="취소"
        onConfirm={() => logout.mutate(undefined)}
        loading={logout.isPending}
      >
        {logout.isError && (
          <Alert variant="error" title="로그아웃을 확인하지 못했어요">
            이 화면은 아직 로그인 상태예요. 다시 시도해 주세요. 여러 번 눌러도 문제없어요.
          </Alert>
        )}
      </Modal>
    </>
  )
}
