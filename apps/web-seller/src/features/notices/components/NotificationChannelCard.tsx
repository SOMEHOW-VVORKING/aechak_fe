import { useState } from 'react'
import { Button, Card, Toggle } from '@aechak/design-system/web'
import { SAMPLE_NOTIFICATION_CHANNELS, type NotificationChannelSetting } from '../notices.mock'

interface NotificationChannelCardProps {
  /** 예시 화면에서는 저장하지 않고 토스트만 띄운다(호출부가 문구를 소유한다). */
  onSave: () => void
}

// 알림 수신 설정 — 토글은 화면 안에서 실제로 움직인다(움직이지 않는 토글은 장식 UI다).
// 저장은 서버로 나가지 않고, 띠와 토스트가 그 사실을 말한다.
export function NotificationChannelCard({ onSave }: NotificationChannelCardProps) {
  const [channels, setChannels] = useState<NotificationChannelSetting[]>(
    SAMPLE_NOTIFICATION_CHANNELS,
  )

  const toggle = (event: NotificationChannelSetting['event'], key: 'email' | 'sms') =>
    setChannels(prev =>
      prev.map(row => (row.event === event ? { ...row, [key]: !row[key] } : row)),
    )

  return (
    <Card padding="md">
      <p className="text-body-sm font-semibold text-text-primary">알림 수신 설정</p>
      <p className="mt-0.5 text-caption text-text-tertiary">
        어떤 일이 생겼을 때 메일과 문자 중 무엇으로 받을지 골라요.
      </p>
      {/* 이 카드는 공지 표 아래라 화면 맨 위의 띠가 보이지 않는 자리에 있다 — 토글이 움직여 설정이
          바뀐 것처럼 읽히므로 카드 안에도 저장되지 않는다는 사실을 글자로 남긴다(교차검토 지적). */}
      <p className="mt-1 text-caption text-warning-fg">
        예시 화면이라 토글을 움직이거나 저장을 눌러도 저장되지 않아요. 새로고침하면 원래 값으로
        돌아가요.
      </p>

      <ul className="mt-3">
        {channels.map(row => (
          <li
            key={row.event}
            className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border-subtle py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-medium text-text-primary">{row.label}</p>
              <p className="mt-0.5 text-caption text-text-tertiary">{row.description}</p>
            </div>
            <Toggle
              checked={row.email}
              ariaLabel={`${row.label} 메일 수신`}
              onChange={() => toggle(row.event, 'email')}
            />
            <span className="-ml-4 text-caption text-text-secondary">메일</span>
            <Toggle
              checked={row.sms}
              ariaLabel={`${row.label} 문자 수신`}
              onChange={() => toggle(row.event, 'sms')}
            />
            <span className="-ml-4 text-caption text-text-secondary">문자</span>
          </li>
        ))}
      </ul>

      <div className="mt-3.5 flex justify-end">
        <Button variant="primary" size="md" onClick={onSave}>
          수신 설정 저장
        </Button>
      </div>
    </Card>
  )
}
