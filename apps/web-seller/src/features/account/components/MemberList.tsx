import { Button, Card, ListItem, StatusPill } from '@aechak/design-system/web'
import {
  MEMBER_ROLE_LABEL,
  MEMBER_STATUS_LABEL,
  MEMBER_STATUS_VARIANT,
  SAMPLE_MEMBERS,
} from '../account.mock'

interface MemberListProps {
  /** 예시 화면에서는 저장하지 않고 토스트만 띄운다(호출부가 문구를 소유한다). */
  onInvite: () => void
}

export function MemberList({ onInvite }: MemberListProps) {
  return (
    <Card padding="md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-body-sm font-semibold text-text-primary">담당자 계정</p>
          <p className="mt-0.5 text-caption text-text-tertiary">
            스토어를 함께 운영할 담당자를 초대하고 역할을 나눠요.
          </p>
        </div>
        <Button variant="secondary" size="md" onClick={onInvite}>
          담당자 초대
        </Button>
      </div>

      <ul className="mt-2">
        {SAMPLE_MEMBERS.map(member => (
          <li key={member.memberId} className="border-b border-border-subtle last:border-b-0">
            <ListItem
              title={`${member.name} / ${MEMBER_ROLE_LABEL[member.role]}`}
              subtitle={
                member.lastActiveAt == null
                  ? `${member.email} / 아직 접속하지 않았어요`
                  : `${member.email} / 마지막 접속 ${member.lastActiveAt}`
              }
              trailing={
                <StatusPill variant={MEMBER_STATUS_VARIANT[member.status]}>
                  {MEMBER_STATUS_LABEL[member.status]}
                </StatusPill>
              }
            />
          </li>
        ))}
      </ul>
    </Card>
  )
}
