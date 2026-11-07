import { useNavigate, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { Button, EmptyState } from '@aechak/design-system/web'

// 없는 주소와 화면 오류를 셸 안에서 안내한다. 라우터 기본값은 영어 한 줄('Not Found')이거나
// 셸까지 지우는 'Something went wrong!'이라 셀러가 돌아갈 길을 잃는다.

export function RouteNotFoundScreen() {
  const navigate = useNavigate()
  return (
    <div className="p-6">
      <EmptyState
        title="페이지를 찾을 수 없어요"
        description="주소가 바뀌었거나 없어진 화면이에요. 왼쪽 메뉴에서 다시 골라 주세요."
        action={{ label: '대시보드로 가기', onClick: () => void navigate({ to: '/' }) }}
      />
    </div>
  )
}

export function RouteErrorScreen({ reset }: ErrorComponentProps) {
  const router = useRouter()
  const navigate = useNavigate()
  const retry = () => {
    reset()
    void router.invalidate()
  }
  return (
    <div className="flex flex-col items-center p-6">
      <EmptyState
        title="화면을 불러오지 못했어요"
        description="잠시 뒤 다시 시도해 주세요. 계속되면 다른 메뉴로 이동해 주세요."
        action={{ label: '다시 시도', onClick: retry }}
      />
      <Button variant="ghost" size="sm" onClick={() => void navigate({ to: '/' })}>
        대시보드로 가기
      </Button>
    </div>
  )
}
