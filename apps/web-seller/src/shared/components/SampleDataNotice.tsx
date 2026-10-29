import type { ReactNode } from 'react'
import { Alert } from '@aechak/design-system/web'

/**
 * 화면 상단 "예시 데이터" 띠 — BE 경로가 아직 없는 화면이 **화면 구성은 보여주되 운영자를 속이지
 * 않게** 하는 장치다.
 *
 * SCRUM-301은 같은 목적을 `UnavailableScreen`(안내만, 목록 없음)으로 달성했는데 "기능에 들어가도
 * 아무것도 없다"는 지적을 받았다. 그래서 목록·폼은 예시 데이터로 그리고, 저장되지 않는다는 사실은
 * 이 띠가 글자로 말한다(AGENTS.md 규약 10의 목적 — 숨기지 않고, 속이지도 않는다. 막아야 하는 것은
 * 메뉴가 아니라 "저장되는 것처럼 보이는 화면"이다).
 *
 * **합치기 메모**: 어드민(web-admin)에도 같은 띠가 필요하다. 지금은 앱마다 한 벌씩 두고(두 앱이
 * 동시에 작업 중이라 DS를 같이 고치면 충돌한다) 두 앱이 모두 올라온 뒤 `packages/design-system`으로
 * 올려 하나로 합친다 — 그때 이 파일과 web-admin의 같은 이름 파일을 지운다.
 */
export const SAMPLE_DATA_TITLE = '예시 데이터'

export interface SampleDataNoticeProps {
  /**
   * 어느 경로가 생기면 실데이터로 바뀌는지 한 줄. 띠 안에 함께 적어 "언제 진짜가 되는지"를
   * 화면에서 바로 읽게 한다(상세는 각 feature의 `*.mock.ts` 머리에 있다).
   */
  replaceWhen: ReactNode
  className?: string
}

export function SampleDataNotice({ replaceWhen, className = 'mb-4' }: SampleDataNoticeProps) {
  return (
    <Alert variant="warning" title={SAMPLE_DATA_TITLE} className={className}>
      <span className="block">
        화면 구성을 먼저 보여드리려고 넣은 <strong>예시</strong>예요. 아래 내용은 서버에서 온 것이
        아니고, 저장/답변/발급을 눌러도 <strong>저장되지 않아요</strong>.
      </span>
      <span className="mt-1 block text-caption">{replaceWhen}</span>
    </Alert>
  )
}

/**
 * 예시 화면의 동작 버튼이 띄우는 토스트 문구 — 눌린 것은 알리고 저장은 하지 않는다.
 * 버튼을 비활성으로 두지 않는 이유는 그러면 "권한이 없다"로 읽히기 때문이다(죽은 UI와 다르다 —
 * 눌리고, 눌린 결과를 사실대로 말한다).
 */
export const SAMPLE_ACTION_TOAST = '예시 화면이라 서버로 전송되지 않았어요.'
