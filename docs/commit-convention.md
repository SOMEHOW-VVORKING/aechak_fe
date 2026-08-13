# 커밋 컨벤션

이 리포의 실제 커밋 이력(`origin/main` 65커밋)에서 뽑은 규칙이다. 새로 만든 규칙이 아니라
지금까지 쓰인 방식을 적어둔 것이라, 예시는 전부 실제 커밋에서 가져왔다.

`AGENTS.md`의 "커밋 메시지 규칙" 절이 형식의 요약이고, 이 문서는 그 형식을 실제로 어떻게 쓰는지
(특히 커밋을 어디서 나누는지) 다룬다.

---

## 형식

```
[SCRUM-XX] <type>: <한글 설명>

<본문 — 불릿 또는 문단>

Co-Authored-By: <AI 모델> <noreply@anthropic.com>
```

### 티켓 접두

- 기본은 `[SCRUM-XX]` 하나다
- **화면이 둘 이상 걸리면 번호를 나란히 붙인다** — `[SCRUM-152][SCRUM-153] feat: 검색 입력·최근검색어·결과·필터 화면 실 API 연동`
- 티켓이 없는 리포 정비성 작업은 접두를 생략한다 — `chore: PR 게이트 CI 워크플로 추가 (GitHub Actions)`

한 티켓이 여러 커밋에 걸치는 것이 정상이다. `[SCRUM-145]`는 7커밋, `[SCRUM-91]`은 6커밋이다.
번호를 아끼려고 관계없는 변경을 한 커밋에 묶지 않는다.

### type

실제 사용 빈도순이다.

| type | 쓰임 | 예시 |
| --- | --- | --- |
| `feat` | 새 기능·화면·API 연동 | `[SCRUM-112] feat: 상품 상세·옵션 화면 실 API 연동 및 장바구니 조합 추가금 전파` |
| `chore` | **API 스펙 등재와 orval 재생성**, CI, 의존성 | `[SCRUM-145] chore: 배송지 API 스펙 등재·orval 클라이언트 재생성` |
| `fix` | 버그 수정 | `[SCRUM-146] fix: 401 세션 만료 전역 로그인 리다이렉트와 refresh 정비` |
| `test` | 테스트·MSW 핸들러 | `[SCRUM-152][SCRUM-153] test: 검색 라우트·mock·E2E 테스트 및 MSW 핸들러 추가` |
| `refactor` | 동작 변경 없는 구조 개선 | `[SCRUM-145] refactor: 배송지 상세주소 와이어 필드를 detailAddress로 통일` |

`docs`와 `style`도 `AGENTS.md`에 열거돼 있으나 아직 쓰인 적은 없다.

### 제목

- 한글 서술형으로 쓴다. 영어 명령형(`add`, `update`)을 쓰지 않는다
- 무엇을 했는지가 드러나야 한다. `feat: 장바구니`처럼 대상만 적지 않는다
- 대등한 항목을 나열할 때 구분자는 가운데점(`·`)이다 — `담기·조회·수정·삭제`
- 계층이나 대비는 슬래시(`/`)를 쓴다 — `셀러 어드민/플랫폼 어드민/구매자 앱`
- 50자를 넘기면 본문으로 내린다

---

## 본문

불릿과 문단 둘 다 쓴다. **무엇을 바꿨는지가 diff에서 보이면 왜 그렇게 했는지를 적는다.**

### 불릿 — 변경 범위가 여러 모듈에 걸칠 때

앞에 모듈 경로나 화면 목업 id를 붙여 어디 이야기인지 밝힌다.

```
- packages/api: 찜하기/해제/내 찜 목록 3개 경로 스키마 추가 + orval 생성물 재생성
- shared/catalog: toCatalogProduct 매퍼를 shared로 승격, 찜 스토어를 서버 미러로 전환
  (hydrateWished/clearWished), toggleWishlist 추가(mock/real 게이트 + generation·epoch reconcile)
- features/wishlist: 목록을 GET /users/me/liked-products 무한쿼리로 전환
```

한 불릿이 길면 이어지는 줄을 두 칸 들여쓴다.

```
- 검색 입력·최근검색어(b3-st-2): getSearchKeywords로 최근·추천 검색어 칩 렌더, 개별·전체 삭제 연동
```

### 문단 — 판단 근거를 남길 때

```
대표 유일성·삭제 시 자동 승격·정렬은 서버가 정하므로 mutation 성공 시 목록을 다시 읽음.
사진은 presigned로 S3에 직접 올리고 tmp 키만 도메인 API에 실어 보냄.
생성된 훅 대신 fetcher만 쓰는 이유는 packages/api와 앱의 react-query 선언 범위가 달라서임.
```

### 남겨야 하는 것

- **알려진 한계와 후속 티켓** — `알려진 한계: 카드 응답에 isLiked 부재 → BE 후속 SCRUM-190`
- **왜 이 방식인지** — 다른 방식을 안 쓴 이유가 있으면 그것이 가장 값진 한 줄이다
- **뒤집은 결정** — 앞선 커밋의 판단을 바꿨으면 그 사실을 적는다

### Co-Authored-By

AI와 함께 작업한 커밋에는 트레일러를 붙인다. 이 리포는 붙이는 쪽이다.

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

`origin/main` 기준으로 창시자 30커밋 중 17개, 두 번째 기여자 21커밋 중 10개에 붙어 있다.

> 백엔드 리포(`aechak_be`)는 트레일러를 붙이지 않는 규칙이다. 리포마다 다르니 섞지 않는다.

---

## 커밋을 어디서 나누나

### API 연동은 세 커밋으로 나눈다

이 리포에서 반복되는 가장 뚜렷한 패턴이다. 펫(`SCRUM-80`), 배송지(`SCRUM-145`),
검색(`SCRUM-152`/`153`)이 모두 같은 순서를 따랐다.

| 순서 | type | 담는 것 |
| --- | --- | --- |
| 1 | `chore` | `packages/api/openapi/schema.yaml` 등재 + `orval` 재생성물 |
| 2 | `feat` | 어댑터·화면 배선, 도메인 타입 |
| 3 | `test` | MSW 핸들러·픽스처, 라우트·단위 테스트, E2E |

```
[SCRUM-145] chore: 배송지 API 스펙 등재·orval 클라이언트 재생성
[SCRUM-145] feat: 배송지 화면 실서버 연동·deliveryAddress 네이밍 통일
[SCRUM-145] test: 배송지 route 테스트를 모듈 모킹에서 MSW로 전환
```

**스펙과 생성물을 첫 커밋에 함께 담는 이유**는 `pnpm openapi:generate:check` 게이트가
`orval && git diff --exit-code src/generated`라, 생성물이 커밋되기 전에는 항상 실패하기
때문이다. 스펙만 커밋하고 생성물을 다음 커밋으로 미루면 그 사이 커밋이 전부 빨갛다.

`packages/api/src/generated/`는 손으로 고치지 않는다. 스펙을 고치고 재생성한다.

### 그 밖에

- **되돌리기 단위로 나눈다.** 한 커밋을 되돌렸을 때 남은 것이 여전히 동작해야 한다
- **리뷰 반영은 별 커밋으로 둔다.** 무엇이 리뷰로 바뀌었는지가 이력에 남는다
- 무관한 정비(오타, 포맷)를 기능 커밋에 끼워넣지 않는다

---

## 브랜치

```
feature/SCRUM-XX-<영문-슬러그>
chore/SCRUM-XX-<영문-슬러그>
```

화면이 둘이면 번호를 이어 붙인다 — `feature/SCRUM-152-153-search-api`.
티켓 없는 정비는 `chore/ci-github-actions`처럼 번호를 생략한다.

슬러그는 영문 소문자와 하이픈이다. API 연동 브랜치는 `-api`로 끝내는 경우가 많다.

---

## 머지 커밋

GitHub 기본 메시지를 그대로 둔다.

```
Merge pull request #11 from SOMEHOW-VVORKING/feature/SCRUM-152-153-search-api
```

`main`을 작업 브랜치로 당겨올 때 정합을 맞춘 내용이 있으면 괄호로 덧붙인다.

```
Merge branch 'main' into feature/SCRUM-164-uiux (상품 상세 실 API와 goBack 이관 정합)
```

---

## 커밋 전 확인

`AGENTS.md`의 PR 게이트 넷을 통과한 상태로 커밋한다.

```
pnpm typecheck
pnpm lint
pnpm test
pnpm openapi:generate:check
```

`openapi:generate:check`는 생성물을 커밋한 뒤에 돌려야 통과한다(위 세 커밋 절 참고).
