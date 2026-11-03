import type { ReactNode } from 'react'
import { Alert } from '@aechak/design-system/web'

/**
 * admin 모듈에 대응 엔드포인트가 없어 **예시 데이터로 모양만 보여주는** 화면의 상단 띠.
 *
 * 왜 막는 대신 밝히는가(AGENTS.md 규약 10): 규약의 목적은 "운영자가 속지 않게 하라"이지
 * 진입을 막는 것이 아니었다. 그런데 `UnavailableScreen`으로 돌려보내는 방식은 운영자가
 * 기능의 모양조차 볼 수 없게 만들어, 2026-10-27에 "목 데이터로 잘 들어가 있던 화면을 다
 * 없앴다"는 지적을 받았다. 그래서 화면은 열어 두고 **예시 데이터임을 화면에서 밝히고 쓰기를
 * 막는** 방식으로 바꿨다(SCRUM-308).
 *
 * 띠를 각 화면에 손으로 붙이지 않고 이 컴포넌트 하나로 모으는 이유: 문구가 화면마다 갈라지면
 * 어떤 화면은 "저장되지 않는다"를 안 적게 되고, 그게 규약이 막으려던 바로 그 상태다.
 * **BE가 실제로 있는 화면(`/sellers/applications`·`/admins`)에는 붙이지 않는다** — 붙이면
 * 실데이터를 예시로 의심하게 만들어 거꾸로 속이는 셈이 된다.
 */
export const MOCK_NOTICE_TITLE = '예시 데이터예요'

/** 띠 본문 기본 문구. 테스트와 화면이 같은 문자열을 보도록 상수로 내보낸다. */
export const MOCK_NOTICE_BODY =
  '화면 모양을 보여주려고 넣은 값이라 서버와 연결되어 있지 않아요. 여기서 바꾼 내용은 저장되지 않아요.'

/**
 * 예시 화면에서 저장·제출·발송을 눌렀을 때 띄우는 문구.
 *
 * 처리 결과를 화면에만 겹쳐 보여주므로(`useDetailList`의 edits) 성공 토스트를 그대로 쓰면
 * 저장된 줄 안다 — 눌린 것은 맞고 저장은 안 됐다는 두 사실을 한 줄에 담는다.
 */
export const MOCK_WRITE_TOAST = '예시 화면이라 저장되지 않아요. 바뀐 표시는 새로 고치면 사라져요.'

interface MockDataNoticeProps {
  /** 화면별로 덧붙이는 한 줄(어느 BE 경로가 생기면 실연동되는지 등). 없으면 기본 문구만. */
  children?: ReactNode
  /**
   * 기본 본문을 대신할 문구. **칸 일부만 예시인 화면에만 쓴다**(대시보드).
   *
   * 기본 문구는 화면 전체가 예시라는 전제로 "서버와 연결되어 있지 않아요"라고 말하는데, 지표
   * 여섯 칸이 실 집계인 대시보드에서 그대로 쓰면 띠가 실데이터를 예시라고 말하게 된다 —
   * 규약 10이 막으려는 "거꾸로 속이는" 쪽이다. 문구를 갈아 끼울 때도 **저장되지 않는다는 말은
   * 남겨야 한다**(규약의 핵심이고 두 테스트가 그 문장을 본다).
   */
  body?: ReactNode
}

export function MockDataNotice({ children, body }: MockDataNoticeProps) {
  return (
    <Alert variant="warning" title={MOCK_NOTICE_TITLE} className="mb-5">
      <p>{body ?? MOCK_NOTICE_BODY}</p>
      {children && <p className="mt-1 text-caption">{children}</p>}
    </Alert>
  )
}
