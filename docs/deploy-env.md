# 배포 환경변수 (SCRUM-272)

세 웹앱의 `VITE_*` 값을 한 표로 둔다. **Cloudflare 설정에 그대로 옮겨 적을 수 있는 형태**가 이 문서의 목적이다.

2026-10-19 dev 배포에서 셀러·어드민 앱이 브라우저에서 `http://localhost:8081`·`http://localhost:8082`를 호출해 전면 실패했다(`ERR_CONNECTION_REFUSED`). 빌드에 `VITE_*`가 주입되지 않아 `main.tsx`의 로컬 기본값이 번들에 굳은 것이었고, 셀러 앱은 `VITE_API_BASE_URL`에 셀러 API 호스트가 들어가 `/categories`·`/auth/*`까지 401이 됐다. 그 뒤 운영 빌드에서는 값이 비거나 로컬 주소를 가리키면 **부팅이 멈추고 사유가 화면에 뜨도록** 바뀌었다(`packages/api/src/env.ts`). 즉 값을 틀리면 조용히 반쯤 동작하는 대신 "설정이 끝나지 않아 화면을 열 수 없어요"가 보인다.

## 1. 값 표

### 앱 ↔ 변수

| 앱 | 빌드 디렉터리 | `VITE_API_BASE_URL` | `VITE_SELLER_API_BASE_URL` | `VITE_ADMIN_API_BASE_URL` | `VITE_MEDIA_BASE_URL` |
|---|---|---|---|---|---|
| web-buyer | `apps/web-buyer` | 필수 | — | — | 선택 |
| web-seller | `apps/web-seller` | **필수** | 필수 | — | 선택 |
| web-admin | `apps/web-admin` | 필수 | — | 필수 | — |

> **`VITE_API_BASE_URL`은 어느 앱에서든 구매자 api 모듈이다.** 셀러 앱에서도 그렇다 — 카테고리 트리(`GET /categories`), 로그인·refresh(`/auth/*`), 업로드 presigned 발급(`POST /files/presigned-url`)이 모두 그 호스트로 나간다. 여기에 셀러/어드민 API 호스트를 넣으면 그 셋이 전부 401·404가 된다. **지금 dev 배포가 틀린 지점이 정확히 여기다.**

### 환경별 값

| 변수 | dev | prod |
|---|---|---|
| `VITE_API_BASE_URL` | `https://api-dev.aechak.co.kr` | `https://api.aechak.co.kr` |
| `VITE_SELLER_API_BASE_URL` | `https://seller-api-dev.aechak.co.kr` | `https://seller-api.aechak.co.kr` |
| `VITE_ADMIN_API_BASE_URL` | `https://admin-api-dev.aechak.co.kr` | `https://admin-api.aechak.co.kr` |
| `VITE_MEDIA_BASE_URL` | `https://media-dev.aechak.co.kr` | `https://media.aechak.co.kr` |

출처는 BE `terraform/route53.tf`의 `locals`다(`api_domain`·`seller_api_domain`·`admin_api_domain`·`media_domain`). prod 값은 그 규칙에서 나온 것이고 **prod 환경은 아직 띄워져 있지 않다**(`terraform/envs/prod.tfvars`의 `frontend_origins`가 아직 `aechak.example.com` TODO다) — prod 배포 전에 실제 생성된 도메인으로 한 번 확인할 것.

### 프런트 도메인 (CORS·로그인 return 화이트리스트와 짝)

| 앱 | 로컬 | dev | prod |
|---|---|---|---|
| web-buyer | `http://localhost:5175` | `https://dev.aechak.co.kr` | `https://aechak.co.kr` |
| web-seller | `http://localhost:5173` | `https://seller-dev.aechak.co.kr` | `https://seller.aechak.co.kr` |
| web-admin | `http://localhost:5174` | `https://admin-dev.aechak.co.kr` | `https://admin.aechak.co.kr` |

이 값은 FE가 쓰는 변수가 아니고 **BE 쪽 설정의 입력**이다. 두 자리에 들어가는데, **둘 다 terraform이 자동으로 만든다** — 사람이 손으로 더할 자리가 아니다(`terraform/ssm-parameters.tf`).

- CORS 허용 origin — `locals`가 배포 도메인(`https://<web|seller|admin>_domain`)과 `terraform/envs/<env>.tfvars`의 로컬 origin을 **합성**한다. api 모듈에는 세 웹 합집합(`CORS_ALLOWED_ORIGINS`), seller·admin 모듈에는 각 콘솔 목록이 들어간다. 그래서 dev tfvars에 로컬 포트만 적혀 있는 것은 **배포 도메인 누락을 뜻하지 않는다** — 배포 도메인은 locals가 붙인다(tfvars 주석도 "배포 도메인은 terraform locals가 붙이므로 여기엔 로컬 포트만 적는다"라고 적어 뒀다).
- 서버 콜백 로그인의 `return` 화이트리스트 — `AUTH_WEB_RETURN_URLS`도 같은 합집합에 `/login/complete`를 붙여 생성된다. **정확 일치**라 오타·끝 슬래시 하나로 로그인이 막힌다(오픈 리다이렉트 방지). 로컬 개발은 그와 별도로 `boot/api`의 `application-local.yml`에 세 앱 모두 등재돼 있다.

따라서 로그인·CORS가 안 될 때 확인할 것은 "값을 손으로 넣었는가"가 아니라 **그 환경에 terraform이 적용됐는가, SSM 파라미터의 실제 값이 무엇인가**다.

```bash
aws ssm get-parameter --name /aechak/dev/api/CORS_ALLOWED_ORIGINS --query Parameter.Value --output text
aws ssm get-parameter --name /aechak/dev/api/AUTH_WEB_RETURN_URLS --query Parameter.Value --output text
```

## 2. Cloudflare에 넣는 값 (복사용)

### 어느 프로젝트를 고치는가

배포는 Cloudflare Pages **Git 연동**이 맡는다(레포에 워크플로 파일은 없지만, PR마다 세 프로젝트가 preview를 만든다 — PR 체크에 `Cloudflare Pages: <프로젝트>`로 나타난다). 환경변수는 각 Pages 프로젝트의 Settings → Environment variables에 넣는다.

| Cloudflare Pages 프로젝트 | 앱 | preview 도메인 |
|---|---|---|
| `aechak-fe` | web-buyer | `<branch>.aechak-fe.pages.dev` |
| `aechak-seller` | web-seller | `<branch>.aechak-seller.pages.dev` |
| `aechak-admin` | web-admin | `<branch>.aechak-admin.pages.dev` |

### 2026-10-19 현재 실제로 들어가 있는 값

preview 번들의 `configureApiHosts` 호출부를 직접 열어 확인한 것이다(`.pages.dev`의 `assets/index-*.js`).

| 프로젝트 | 측정된 값 | 판정 |
|---|---|---|
| `aechak-fe` | `apiOrigin: "https://api-dev.aechak.co.kr"` | 정상 |
| `aechak-seller` | `apiOrigin: "https://seller-api-dev.aechak.co.kr"`, `sellerOrigin: undefined ?? "http://localhost:8081"` | **둘 다 틀렸다** |
| `aechak-admin` | `apiOrigin: "https://api-dev.aechak.co.kr"`, `adminOrigin: undefined ?? "http://localhost:8082"` | **adminOrigin 미설정** |

즉 고쳐야 할 것은 정확히 셋이다.

1. `aechak-seller`의 `VITE_API_BASE_URL`을 `https://seller-api-dev.aechak.co.kr` → **`https://api-dev.aechak.co.kr`** 로 바꾼다.
2. `aechak-seller`에 `VITE_SELLER_API_BASE_URL=https://seller-api-dev.aechak.co.kr` 을 **추가**한다.
3. `aechak-admin`에 `VITE_ADMIN_API_BASE_URL=https://admin-api-dev.aechak.co.kr` 을 **추가**한다.

`VITE_MEDIA_BASE_URL`은 라우트 분할 청크에 들어가 진입 번들에서 확인되지 않았다 — 설정 화면에서 직접 확인할 것(미설정이면 썸네일만 placeholder가 되고 API는 정상이다).

> ⚠️ 호스트 변수 검증이 들어간 뒤로는, 값이 비거나 로컬 주소를 가리키는 배포는 **흰 화면이 아니라 "설정이 끝나지 않아 화면을 열 수 없어요" 안내**를 띄우고 부팅하지 않는다. 위 셋을 넣기 전까지 `aechak-seller`·`aechak-admin`의 preview·운영 배포가 그 화면으로 보이는 것이 정상 동작이다(이전에는 화면이 뜬 채로 모든 요청이 실패했다).

### 환경변수 블록

세 앱을 각각 별도 프로젝트로 빌드한다. 모노레포이므로 빌드 커맨드가 루트에서 돌고 출력은 앱 디렉터리 아래다.

```
# ── web-buyer (dev)
VITE_API_BASE_URL=https://api-dev.aechak.co.kr
VITE_MEDIA_BASE_URL=https://media-dev.aechak.co.kr

# ── web-seller (dev)
VITE_API_BASE_URL=https://api-dev.aechak.co.kr
VITE_SELLER_API_BASE_URL=https://seller-api-dev.aechak.co.kr
VITE_MEDIA_BASE_URL=https://media-dev.aechak.co.kr

# ── web-admin (dev)
VITE_API_BASE_URL=https://api-dev.aechak.co.kr
VITE_ADMIN_API_BASE_URL=https://admin-api-dev.aechak.co.kr
```

```
# ── web-buyer (prod)
VITE_API_BASE_URL=https://api.aechak.co.kr
VITE_MEDIA_BASE_URL=https://media.aechak.co.kr

# ── web-seller (prod)
VITE_API_BASE_URL=https://api.aechak.co.kr
VITE_SELLER_API_BASE_URL=https://seller-api.aechak.co.kr
VITE_MEDIA_BASE_URL=https://media.aechak.co.kr

# ── web-admin (prod)
VITE_API_BASE_URL=https://api.aechak.co.kr
VITE_ADMIN_API_BASE_URL=https://admin-api.aechak.co.kr
```

빌드 설정(세 앱 공통 형태):

| 항목 | 값 |
|---|---|
| Build command | `pnpm install --frozen-lockfile && pnpm --filter <앱> build` |
| Build output directory | `apps/<앱>/dist` |
| Node version | 22 |

`<앱>`은 `web-buyer` / `web-seller` / `web-admin`이다.

## 3. 값을 쓸 때의 규칙

`packages/api`의 검증이 운영 빌드에서 강제하는 것들이다. 어기면 배포된 앱이 부팅하지 않고 어느 변수가 왜 틀렸는지 화면에 뜬다.

1. **origin만 적는다.** 경로·쿼리·해시·자격증명을 붙이지 않는다. 경로 접두 `/api/v1`은 코드(`client.ts`의 `API_PATH_PREFIX`)가 붙이므로 값에 함께 넣으면 `/api/v1/api/v1`로 나가 전부 404다. `packages/api/openapi/schema.yaml`의 `servers`에는 접두가 포함돼 적혀 있어(문서 정확성용, orval은 무시한다) 그대로 복사하기 쉬운 자리다.
2. **스킴을 적는다.** `api-dev.aechak.co.kr`처럼 `https://`가 빠지면 axios가 상대경로로 해석해 배포 도메인 자신에게 요청을 보낸다.
3. **운영 빌드에 로컬 주소를 넣지 않는다.** `localhost`·`127.0.0.1`·`0.0.0.0`·`::1`·`*.localhost`는 모두 거절된다 — 이번 사고의 조건이다.
4. **빈 값은 미설정과 같다.** 공백만 넣어도 비어 있는 것으로 본다.
5. `VITE_MEDIA_BASE_URL`은 이 검증 대상이 아니다. 미설정이면 URL을 지어내지 않고 placeholder 썸네일을 보여준다(`shared/catalog/media.ts`, `products.queries.ts`의 `productImageUrl`).

로컬 개발은 `.env` 없이도 돈다 — 개발 빌드에서는 로컬 기본값(api 8080 / seller 8081 / admin 8082)을 쓴다. 값을 바꿔야 하면 각 앱의 `.env.example`을 복사해 `.env`로 쓴다.

## 4. 범위 밖 (사람이 해야 하는 일)

- **Cloudflare Pages 프로젝트에 위 변수를 등재하는 것**(2절의 고칠 것 셋) — 레포에서 바꿀 수 있는 자리가 아니다. SCRUM-272 티켓도 "클라우드플레어 환경변수 등재와 프론트 배포 자동화는 범위 밖"으로 못박았다.
- **FE 배포 자동화** — 빌드 자체는 이미 Cloudflare Pages Git 연동이 돌리고 있다(레포 워크플로는 없다). 그 배선을 바꾸는 일은 범위 밖이다.
- **dev 환경에 terraform이 적용됐는지 확인** — CORS origin과 로그인 `return` 화이트리스트는 `ssm-parameters.tf`가 배포 도메인을 포함해 생성하므로 손으로 넣을 것이 없지만, 그 환경에 apply가 되지 않았거나 ECS 태스크가 갱신 전 값으로 떠 있으면 배포 도메인에서 오는 요청이 막힌다. 위 `aws ssm get-parameter`로 실제 값을 먼저 본다.
- **`schema.yaml`의 `servers` prod 항목이 `https://api.aechak.com`으로 적혀 있다** — 실제 hosted zone은 `aechak.co.kr`이다. 문서 정확성용 필드이고 orval이 무시하므로 동작에는 영향이 없지만, 이 문서와 어긋나므로 정정이 필요하다(별 티켓).
