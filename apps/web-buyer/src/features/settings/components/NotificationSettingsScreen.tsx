import { useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { MobileScreen, Toggle } from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { SettingsControlRow, SettingsGroup } from './SettingsSection'

// 알림 설정(b11-st-2). 전체 알림(마스터) + 야간 알림. 마스터가 꺼지면 야간 알림은 비활성
// (종속)되고 "앱 알림을 모두 껐어요" 토스트가 뜬다. 실제 알림 기능은 범위 밖 — 토글 UI만 동작.
export function NotificationSettingsScreen() {
  const navigate = useNavigate()
  const router = useRouter()

  const [allOn, setAllOn] = useState(true)
  const [nightOn, setNightOn] = useState(true)
  const [toastOpen, setToastOpen] = useState(false)

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/settings' })
  }

  const handleAllChange = (next: boolean) => {
    setAllOn(next)
    if (!next) setToastOpen(true)
  }

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="알림 설정" />}>
      <div className="flex flex-col gap-5 p-4">
        <SettingsGroup
          footnote={
            allOn
              ? '앱의 모든 푸시 알림을 한 번에 켜고 끌 수 있어요.'
              : '전체 알림이 꺼져 있어 다른 알림은 받을 수 없어요.'
          }
        >
          <SettingsControlRow
            title="전체 알림"
            control={<Toggle checked={allOn} onChange={handleAllChange} />}
          />
        </SettingsGroup>

        <SettingsGroup label="야간 알림">
          <SettingsControlRow
            title="야간 알림 받기"
            description="오후 9시부터 오전 8시까지 알림을 받을지 설정해요."
            disabled={!allOn}
            control={
              <Toggle checked={allOn && nightOn} disabled={!allOn} onChange={setNightOn} />
            }
          />
        </SettingsGroup>
      </div>

      <AppToast
        open={toastOpen}
        onClose={() => setToastOpen(false)}
        message="앱 알림을 모두 껐어요."
        variant="info"
      />
    </MobileScreen>
  )
}
