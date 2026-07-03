@AGENTS.md

<!-- Claude 전용 보충 규칙 -->

## Claude 특이사항

- 파일 수정 전 반드시 `Read` 툴로 파일 내용 확인
- 새 파일 생성 시 `packages/config/tsconfig/react.json` 또는 `react-native.json` 상속 확인
- TypeScript 오류 발생 시 `pnpm --filter <package> typecheck` 먼저 확인
- PR 게이트 4가지는 항상 통과한 상태로 작업 마무리
