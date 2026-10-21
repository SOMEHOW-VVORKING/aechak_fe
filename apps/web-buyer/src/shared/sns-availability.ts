// SNS-01 BE(SNS-T01~T03)가 배포되기 전에는 앱 안의 SNS 진입점(마이 메뉴의 내 SNS 프로필, 차단/뮤트 관리)을 숨긴다
// (AGENTS.md 6절 10, web-seller의 SERVER_*_AVAILABLE과 같은 방식). 라우트는 그대로 두어 테스트와 연동 확인에 쓴다.
// BE가 배포되면 true로 올린다.
export const SNS_SERVER_AVAILABLE = false
