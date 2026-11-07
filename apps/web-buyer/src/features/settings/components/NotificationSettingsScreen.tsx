import { useState } from 'react'
import { MobileScreen, Toggle } from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { SettingsControlRow, SettingsGroup } from './SettingsSection'

// 알림 설정(b11-st-2). 전체 알림(마스터) + 야간 알림. 마스터가 꺼지면 야간 알림은 비활성
// (종속)된다. 서버에 알림 도메인도 설정 저장 경로도 없어 토글은 이 화면에만 남는다 —
// "켜고 끌 수 있어요" 같은 문구를 두면 저장된 줄 알게 되므로, 안내 자리에서 그 사실을 밝힌다.
export function NotificationSettingsScreen() {
  const [allOn, setAllOn] = useState(true)
  const [nightOn, setNightOn] = useState(true)
  const [toastOpen, setToastOpen] = useState(false)

  const goBack = useSafeBack({ to: '/settings' })

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
              ? '아직 앱 푸시 알림은 나가지 않아요. 여기서 고른 값도 저장되지 않고 이 화면에만 남아요.'
              : '전체 알림을 끈 표시예요. 아직 푸시 알림 자체가 나가지 않고, 이 선택도 저장되지 않아요.'
          }
        >
          <SettingsControlRow
            title="전체 알림"
            control={<Toggle checked={allOn} onChange={handleAllChange} ariaLabel="전체 알림" />}
          />
        </SettingsGroup>

        <SettingsGroup label="야간 알림">
          <SettingsControlRow
            title="야간 알림 받기"
            description="오후 9시부터 오전 8시까지 알림을 받을지 설정해요."
            disabled={!allOn}
            control={
              <Toggle
                checked={allOn && nightOn}
                disabled={!allOn}
                onChange={setNightOn}
                ariaLabel="야간 알림 받기"
              />
            }
          />
        </SettingsGroup>
      </div>

      <AppToast
        open={toastOpen}
        onClose={() => setToastOpen(false)}
        message="앱 알림을 모두 끈 것으로 표시했어요. 저장되지는 않아요."
        variant="info"
      />
    </MobileScreen>
  )
}
