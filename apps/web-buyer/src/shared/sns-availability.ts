// SNS를 운영에 공개하기 전에는 앱 안의 SNS 진입점(마이 메뉴의 내 SNS 프로필, 차단/뮤트 관리)을 숨긴다
// (AGENTS.md 6절 10, web-seller의 SERVER_*_AVAILABLE과 같은 방식). 라우트는 그대로 두어 테스트와 연동 확인에 쓴다.
// SNS-01 BE가 배포돼도 열지 않는다. 마지막 SNS BE 티켓(SNS-T18)을 마치고 SNS를 운영에 공개할 때 true로 올린다.
export const SNS_SERVER_AVAILABLE = false
