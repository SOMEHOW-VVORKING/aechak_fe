# Web Design System Components

import 경로: `@aechak/design-system/web`

---

## Accordion

```tsx
<Accordion
  items={[{ key: 'q1', title: '주문을 취소하고 싶어요.', content: '상품 준비 전이면 바로 취소할 수 있어요.' }]}
  openKeys={openKeys}
  onChange={setOpenKeys}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `items` | `{ key: string; title: string; content: ReactNode }[]` | **필수** |
| `openKeys` | `string[]` | **필수** |
| `onChange` | `(openKeys: string[]) => void` | **필수** |

여러 항목 동시 확장 가능 (단일 확장이 필요하면 호출부에서 `openKeys` 길이를 1로 제한).

---

## Alert

```tsx
<Alert variant="info" title="제목">본문 텍스트</Alert>
```

| prop | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `variant` | `'info' \| 'warning' \| 'error' \| 'danger'` | `'info'` | |
| `title` | `string` | — | 굵은 제목 |
| `children` | `ReactNode` | **필수** | 본문 — `message` prop 없음 |
| `onDismiss` | `() => void` | — | X 버튼 표시 및 핸들러 |

---

## Avatar

```tsx
<Avatar name="김지원" size="md" />
<Avatar src="https://..." size="lg" />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `src` | `string` | — |
| `name` | `string` | — |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` |

우선순위: `src` → `name` 이니셜 → 빈 원

---

## Badge

```tsx
<Badge count={5} />
<Badge count={150} max={99} />  {/* → "99+" */}
<Badge dot />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `count` | `number` | — |
| `dot` | `boolean` | `false` |
| `max` | `number` | `99` |

위치는 부모에서 `absolute` 처리. Badge 자체는 위치를 갖지 않음.

---

## BarChart

```tsx
<BarChart data={[{ label: '13일', value: 55 }, { label: '14일', value: 68 }]} formatValue={(v) => `${v}백만원`} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `data` | `{ label: string; value: number }[]` | **필수** |
| `height` | `number` (px) | `120` |
| `color` | `'brand' \| 'accent' \| 'danger'` | `'brand'` |
| `formatValue` | `(value: number) => string` | — |

외부 차트 라이브러리 의존성 없음. 값은 `data` 내 최댓값 대비 비율로 막대 높이 계산.

---

## BottomSheet

```tsx
<BottomSheet open={open} onClose={() => setOpen(false)} title="정렬 기준">
  {/* 옵션 목록 등 */}
</BottomSheet>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `open` | `boolean` | **필수** |
| `onClose` | `() => void` | **필수** |
| `children` | `ReactNode` | **필수** |
| `title` | `string` | — |
| `showGrabber` | `boolean` | `true` |
| `maxHeight` | `number` (px) | — (미지정 시 뷰포트 90%) |
| `className` | `string` | — |

하단에서 올라오는 시트. 화면 아래에 붙어(스크림 + 상단만 둥근 모서리) 옵션/필터 시트·비회원 게이트 등에
쓴다. 스크림 클릭·ESC로 닫히고 포커스 트랩·바디 스크롤 잠금은 `Modal`/`Drawer`와 동일한 패턴. 옆에서
나오는 패널이 필요하면 `Drawer`를 쓸 것 (`BottomSheet` ≠ `Drawer`). 네이티브 `BottomSheet`의 `visible`
대신 `Modal`/`Drawer`와 맞춘 `open`을 쓴다.

---

## Button

```tsx
<Button variant="primary" size="md">텍스트</Button>
<Button variant="danger" loading>저장 중</Button>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'primary'` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `fullWidth` | `boolean` | `false` |
| `loading` | `boolean` | `false` |
| `leftIcon` | `ReactNode` | — |
| `rightIcon` | `ReactNode` | — |

나머지는 `ButtonHTMLAttributes` 그대로 전달됨.

---

## Card

```tsx
<Card padding="md" selected onClick={() => {}}>내용</Card>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `padding` | `'none' \| 'md'` | `'none'` |
| `selected` | `boolean` | — |
| `onClick` | `() => void` | — |

`onClick` 있으면 `role="button"` + 키보드(Enter/Space) 자동 지원.

---

## CategoryTree

```tsx
<CategoryTree
  nodes={[{ key: 'food', label: '사료/간식', children: [{ key: 'dry', label: '건식사료' }] }]}
  activeKey={activeKey}
  onSelect={setActiveKey}
  expandedKeys={expandedKeys}
  onExpandedChange={setExpandedKeys}
/>
```

```ts
interface CategoryTreeNode {
  key: string
  label: string
  children?: CategoryTreeNode[]
}
```

| prop | 타입 | 기본값 |
|---|---|---|
| `nodes` | `CategoryTreeNode[]` | **필수** |
| `activeKey` | `string` | — |
| `onSelect` | `(key: string) => void` | **필수** |
| `expandedKeys` | `string[]` | **필수** |
| `onExpandedChange` | `(keys: string[]) => void` | **필수** |

재귀 구조 — depth 제한 없음. 자식이 있는 노드는 굵게 표시되며 클릭 시 확장/축소와 선택이 함께 일어남.

---

## Checkbox

```tsx
<Checkbox checked={val} label="동의" onChange={setVal} />
<Checkbox checked={false} indeterminate onChange={() => {}} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `checked` | `boolean` | **필수** |
| `onChange` | `(checked: boolean) => void` | **필수** |
| `indeterminate` | `boolean` | `false` |
| `disabled` | `boolean` | — |
| `error` | `boolean` | — |
| `label` | `string` | — |

---

## Chip

```tsx
<Chip onRemove={() => handleRemove('자동 급식기')}>자동 급식기</Chip>
<Chip>고정 태그</Chip>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `children` | `ReactNode` | **필수** |
| `onRemove` | `() => void` | — |

`onRemove` 있으면 X 버튼 표시. 토글 가능한 필터 칩 그룹은 `FilterChipGroup` 사용.

---

## CouponCard

```tsx
// 선택 모드 (체크아웃 쿠폰 선택 시트)
<CouponCard
  discountLabel="5,000원"
  title="스토어 쿠폰"
  condition="냥이상점 · 최소주문 30,000원"
  expiry="~2026.06.30"
  selected={selected === 'c1'}
  onSelect={() => setSelected('c1')}
/>

// 수령 모드 (쿠폰 받기 시트)
<CouponCard discountLabel="10%" title="신규 회원 쿠폰" condition="전 상품 · 최대 3,000원 할인" expiry="~2026.06.20" onClaim={handleClaim} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `discountLabel` | `string` | **필수** |
| `title` | `string` | **필수** |
| `condition` | `string` | — |
| `expiry` | `string` | — |
| `disabledReason` | `ReactNode` | — |
| `selected` | `boolean` | `false` |
| `disabled` | `boolean` | `false` |
| `onSelect` | `() => void` | — |
| `onClaim` | `() => void` | — |
| `claimLabel` | `string` | `'받기'` |
| `name` | `string` | — |

`onSelect` 주면 라디오 선택형 카드, `onClaim` 주면 "받기" 버튼형 카드. `disabled`일 때 `condition`/`expiry` 대신 `disabledReason` 표시. 여러 `CouponCard`를 라디오 그룹으로 묶을 때는 동일한 `name`을 전달.

---

## DataTable

```tsx
<DataTable
  rows={rows}
  columns={columns}
  rowKey={(r) => r.id}
  selectedKeys={selected}
  onSelectChange={setSelected}
/>
```

**Column 타입:**
```ts
interface Column<T> {
  key: string
  label: string        // ← 'header' 아님
  width?: string
  align?: 'left' | 'center' | 'right'  // 기본 'left'. 헤더 label과 셀 내용 모두에 적용됨
  sortable?: boolean
  render?: (row: T) => ReactNode
}
```

| prop | 타입 | 기본값 |
|---|---|---|
| `rows` | `T[]` | **필수** |
| `columns` | `Column<T>[]` | **필수** |
| `rowKey` | `(row: T) => string` | **필수** |
| `selectedKeys` | `Set<string>` | — |
| `onSelectChange` | `(keys: Set<string>) => void` | — |
| `onRowClick` | `(row: T) => void` | — |
| `sortKey` | `string` | — |
| `sortDir` | `'asc' \| 'desc'` | — |
| `onSort` | `(key: string) => void` | — |
| `loading` | `boolean` | `false` |
| `emptyLabel` | `string` | `'데이터가 없습니다.'` |

`onRowClick`을 주면 행 전체가 클릭 가능해짐(`cursor-pointer` 자동 적용) — 셀 안의 개별
버튼(예: 이름/ID 링크) `onClick`과 동시에 둬도 됨(같은 핸들러를 두 번 호출해도 멱등하면 안전).
`align`은 StatusPill·숫자 컬럼처럼 왼쪽 정렬이 어색한 컬럼에 사용 — 숫자/카운트 컬럼은
`right`, StatusPill 단독 컬럼은 `center` 권장.

---

## DatePicker

```tsx
<DatePicker label="시작일" value={date} onChange={setDate} min="2026-01-01" />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `label` | `string` | — |
| `value` | `string` (`yyyy-mm-dd`) | **필수** |
| `onChange` | `(value: string) => void` | **필수** |
| `min` | `string` | — |
| `max` | `string` | — |
| `state` | `'default' \| 'error' \| 'success'` | `'default'` |
| `helperText` | `string` | — |
| `disabled` | `boolean` | — |

네이티브 `<input type="date">` 래핑. `onChange`는 `string` 직접 전달.

---

## DocumentHeader

```tsx
<DocumentHeader title="개인정보 처리방침" revision="최종 개정일 2026.05.01 · 시행일 2026.05.15" />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `title` | `string` | **필수** |
| `revision` | `string` | — |

약관·정책류 문서 화면 상단에 사용.

---

## Drawer

```tsx
<Drawer open={open} onClose={() => setOpen(false)} title="필터" width="md">
  {/* 내용 */}
</Drawer>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `open` | `boolean` | **필수** |
| `onClose` | `() => void` | **필수** |
| `title` | `string` | — |
| `width` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `children` | `ReactNode` | **필수** |

---

## EmptyState

```tsx
<EmptyState
  title="데이터 없음"
  description="조건을 변경해보세요."
  action={{ label: '초기화', onClick: handleReset }}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `title` | `string` | **필수** |
| `icon` | `ReactNode` | — |
| `description` | `string` | — |
| `action` | `{ label: string; onClick: () => void }` | — |

---

## FilterBar

```tsx
<FilterBar>
  <Select ... />
  <Input ... />
  <Button>초기화</Button>
</FilterBar>
```

슬롯 기반. `children`만 받음. 내부 정렬(flex wrap gap-2)은 자동.

---

## FilterChipGroup

```tsx
<FilterChipGroup
  options={[{ value: 'all', label: '전체' }, { value: 'food', label: '사료·간식' }]}
  value={selected}
  onChange={setSelected}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `options` | `{ value: string; label: string; icon?: ReactNode }[]` | **필수** |
| `value` | `string[]` | **필수** |
| `onChange` | `(value: string[]) => void` | **필수** |

다중 토글 그룹. 단일 선택이 필요하면 호출부에서 `value` 배열 길이를 1로 제한.

---

## FormSection

```tsx
<FormSection title="판매자 유형" step={1} stepStatus="done">
  <Select ... />
</FormSection>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `title` | `string` | **필수** |
| `step` | `number` | — |
| `stepStatus` | `'active' \| 'done' \| 'todo'` | `'active'` |
| `children` | `ReactNode` | **필수** |

`step` 미지정 시 단계 배지 숨김. `stepStatus="done"`이면 배지가 숫자 대신 체크 아이콘 표시.

---

## Input

```tsx
<Input label="검색" placeholder="입력" value={val} onChange={(e) => setVal(e.target.value)} />
<Input value={val} clearable onClear={() => setVal('')} onChange={(e) => setVal(e.target.value)} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `label` | `string` | — |
| `state` | `'default' \| 'error' \| 'success'` | `'default'` |
| `helperText` | `string` | — |
| `leftAddon` | `ReactNode` | — |
| `rightAddon` | `ReactNode` | — |
| `clearable` | `boolean` | `false` |
| `onClear` | `() => void` | — |

`onChange`는 표준 `ChangeEvent<HTMLInputElement>`. Textarea와 다름.

---

## ListItem

```tsx
<ListItem
  leading={<i data-lucide="bell" />}
  title="알림 설정"
  trailing={<i data-lucide="chevron-right" />}
  onClick={() => navigate('/settings/notifications')}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `title` | `string` | **필수** |
| `subtitle` | `string` | — |
| `leading` | `ReactNode` | — |
| `trailing` | `ReactNode` | — |
| `onClick` | `() => void` | — |

설정/마이페이지형 메뉴 로우. `onClick` 있으면 `role="button"` + 키보드 지원.

---

## MetricCard

```tsx
<MetricCard label="오늘 주문" value="142건" footer="+12%" variant="default" />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `label` | `string` | **필수** |
| `value` | `string \| number` | **필수** |
| `icon` | `ReactNode` | — |
| `footer` | `ReactNode` | — |
| `variant` | `'default' \| 'urgent' \| 'quiet'` | `'default'` |
| `onClick` | `() => void` | — |

---

## Modal

```tsx
<Modal
  open={open}
  onClose={() => setOpen(false)}
  title="확인"
  description="이 작업을 진행하시겠습니까?"
  onConfirm={handleConfirm}
  confirmVariant="danger"
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `open` | `boolean` | **필수** |
| `onClose` | `() => void` | **필수** |
| `title` | `string` | **필수** |
| `description` | `string` | — |
| `confirmLabel` | `string` | `'확인'` |
| `cancelLabel` | `string` | `'취소'` |
| `onConfirm` | `() => void` | — |
| `confirmVariant` | `'primary' \| 'danger'` | `'primary'` |
| `loading` | `boolean` | `false` |
| `children` | `ReactNode` | — |

**주의:** 취소 버튼은 항상 렌더링됨. `children`은 title/description 아래 추가 영역. 버튼을 children 안에 또 넣으면 중복됨.

---

## NumberInput

```tsx
<NumberInput value={qty} onChange={setQty} min={1} max={99} />
<NumberInput value={qty} onChange={setQty} size="sm" />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `value` | `number` | **필수** |
| `onChange` | `(value: number) => void` | **필수** |
| `min` | `number` | `-Infinity` |
| `max` | `number` | `Infinity` |
| `step` | `number` | `1` |
| `size` | `'sm' \| 'md'` | `'md'` |
| `disabled` | `boolean` | — |

경계값 도달 시 해당 증감 버튼 자동 비활성화.

---

## PageHeader

```tsx
<PageHeader
  title="상품 관리"
  actions={<Button size="sm">등록</Button>}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `title` | `string` | **필수** |
| `actions` | `ReactNode` | — |

---

## PermissionMatrix

```tsx
<PermissionMatrix
  roles={[{ key: 'op', label: '운영 매니저' }, { key: 'cs', label: 'CS 담당' }]}
  rows={[{ key: 'review', label: '셀러 심사' }]}
  value={{ review: ['op'] }}
  onChange={setPermissions}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `roles` | `{ key: string; label: string }[]` | **필수** |
| `rows` | `{ key: string; label: string }[]` | **필수** |
| `value` | `Record<string, string[]>` (행 key → 허용된 역할 key 배열) | **필수** |
| `onChange` | `(value: Record<string, string[]>) => void` | — |
| `menuLabel` | `string` | `'메뉴 / 역할'` |

`onChange` 없으면 읽기 전용(클릭 비활성화)으로 렌더링.

---

## PhotoUpload

```tsx
<PhotoUpload photos={urls} onAdd={handleAdd} onRemove={handleRemove} max={5} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `photos` | `string[]` (이미지 URL) | **필수** |
| `onAdd` | `(files: File[]) => void` | **필수** |
| `onRemove` | `(index: number) => void` | **필수** |
| `max` | `number` | `5` |
| `disabled` | `boolean` | — |

`photos.length`가 `max`에 도달하면 첨부 버튼 자동 숨김.

---

## ProductCard

```tsx
<ProductCard
  image="https://..."
  storeName="냥이상점"
  name="고양이 자동 급식기 5L"
  price={64000}
  originalPrice={89000}
  wished={wished}
  onWishToggle={() => setWished(v => !v)}
  onClick={() => navigate({ to: '/product/$id', params: { id } })}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `image` | `string` | **필수** |
| `name` | `string` | **필수** |
| `price` | `number` | **필수** |
| `originalPrice` | `number` | — |
| `storeName` | `string` | — |
| `isSold` | `boolean` | — |
| `soldLabel` | `string` | `'품절'` |
| `onClick` | `() => void` | — |
| `wished` | `boolean` | — |
| `onWishToggle` | `() => void` | — |
| `className` | `string` | — |

상품 그리드 카드. 할인율은 `originalPrice`로 내부 자동 계산(세일 뱃지=코랄, 가격 행에 `%` + 원가
취소선; 반올림이 0%면 표시 안 함), 가격은 `toLocaleString('ko-KR') + '원'`. `isSold`면 썸네일이
흐려지고 중앙에 pill이 뜬다 — 라벨은 기본 '품절'이고 `soldLabel`로 바꿀 수 있다(품절 외에 살 수 없는
사유, 예: 진입 불가 상품의 '판매 중단'). `onWishToggle`을 주면 썸네일 우상단에 찜 하트가 나타난다 — 하트는 카드
이동 클릭 영역(카드 전체를 덮는 stretched 버튼)과 **형제**로 분리돼 마우스·키보드(Enter/Space)
모두에서 찜만 독립 토글되고 카드 이동을 유발하지 않으며(중첩 인터랙티브 없음), 탭 스톱도 둘로
나뉜다. `onWishToggle` 없으면 하트 자체를 렌더링하지 않는다. 커서는 **비품절 + `onClick`** 카드가
전체 `cursor-pointer`, **품절(`isSold`)**은 이동 불가라 `cursor-not-allowed`(이동 버튼도 렌더 안 함).
네이티브 `ProductCard`의 `onPress` 대신 web 관용 `onClick`을 쓴다.

---

## Radio

```tsx
<Radio label="옵션 A" name="group" value="a" checked={val === 'a'} onChange={() => setVal('a')} />
```

| prop | 타입 |
|---|---|
| `checked` | `boolean` |
| `onChange` | `() => void` |
| `label` | `string` |
| `name` | `string` |
| `value` | `string` |
| `disabled` | `boolean` |

---

## RadioCard

```tsx
<RadioCard
  selected={type === 'business'}
  onSelect={() => setType('business')}
  title="사업자 셀러"
  description="사업자등록증 보유"
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `selected` | `boolean` | **필수** |
| `onSelect` | `() => void` | **필수** |
| `title` | `string` | **필수** |
| `description` | `string` | — |
| `icon` | `ReactNode` | — |
| `disabled` | `boolean` | — |
| `name` | `string` | — |

유형 선택·판정 옵션 등 큰 선택 카드가 필요할 때 사용. 쿠폰 전용은 `CouponCard` 사용. 여러 `RadioCard`를 라디오 그룹으로 묶을 때는 동일한 `name`을 전달.

---

## RatingInput

```tsx
<RatingInput value={rating} onChange={setRating} />
<RatingInput value={4.8} readonly size={14} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `value` | `number` | **필수** |
| `onChange` | `(value: number) => void` | — |
| `max` | `number` | `5` |
| `size` | `number` (px) | `28` |
| `readonly` | `boolean` | — |
| `className` | `string` | — |

별점 입력·표시. `onChange`가 없거나 `readonly`면 표시 전용(별을 누를 수 없음)이며 이 모드에서는 `value`가
소수여도(예: `4.8`) 별이 부분적으로 채워진다(평균 별점 표시용). 입력 모드(`onChange` 전달)는 별을 탭해
정수 단위로 선택한다. 채워진 별은 앰버(`warning`) 색.

---

## ReviewCard

```tsx
<ReviewCard
  author="집사**"
  rating={5}
  date="06.11"
  content="먼지가 거의 안 날려요. 재구매 의사 있어요."
  verifiedPurchase
  images={['https://...']}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `author` | `string` | **필수** |
| `rating` | `1 \| 2 \| 3 \| 4 \| 5` | **필수** |
| `date` | `string` | **필수** |
| `content` | `string` | **필수** |
| `images` | `string[]` | — |
| `verifiedPurchase` | `boolean` | — |
| `className` | `string` | — |

리뷰 카드. 상단에 별점(`RatingInput` readonly 재사용)과 날짜, 그 아래 작성자 + 구매 인증 pill
(`verifiedPurchase`일 때만), 본문, 사진(가로 스크롤 썸네일) 순으로 렌더링. 네이티브 `ReviewCard`를
미러하되 목업(b4-st-3)의 구매 인증 pill을 옵션으로 추가.

---

## SearchInput

```tsx
<SearchInput value={keyword} onChange={setKeyword} placeholder="상품명 검색" />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `value` | `string` | **필수** |
| `onChange` | `(value: string) => void` | **필수** |
| `onClear` | `() => void` | — |
| `placeholder` | `string` | `'검색'` |
| `disabled` | `boolean` | — |

필터바 등에 쓰는 pill 형태 검색 입력. 값이 있을 때 지우기 버튼 자동 표시. 나머지는 `InputHTMLAttributes`(`value`/`onChange`/`size` 제외) 그대로 전달됨.

---

## SegmentedControl

```tsx
<SegmentedControl
  options={[{ value: 'personal', label: '개인 일반' }, { value: 'biz', label: '개인 사업자' }]}
  value={sellerType}
  onChange={setSellerType}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `options` | `{ value: string; label: string; icon?: ReactNode }[]` | **필수** |
| `value` | `string` | **필수** |
| `onChange` | `(value: string) => void` | **필수** |

---

## Select

```tsx
<Select
  label="카테고리"
  placeholder="선택"
  options={[{ value: 'a', label: 'A' }]}
  value={val}
  onChange={setVal}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `options` | `{ value: string; label: string }[]` | **필수** |
| `label` | `string` | — |
| `placeholder` | `string` | — |
| `error` | `string` | — |
| `onChange` | `(value: string) => void` | — |

`onChange`는 `string` 직접 전달. `ChangeEvent` 아님.

---

## SideNav

```tsx
<SideNav
  groups={groups}
  activeKey={key}
  onSelect={setKey}
  header={<Logo />}
  collapsed={collapsed}
  onCollapsedChange={setCollapsed}
/>
```

```ts
interface NavItem  { key: string; label: string; icon?: ReactNode; badge?: number; tag?: string }
interface NavGroup { label?: string; items: NavItem[] }
```

`badge`(숫자)와 `tag`(글자)는 쓰임이 달라 필드가 나뉘어 있고 한 항목에 둘을 함께 줄 수 있다 —
`badge`는 "처리할 일이 몇 건 쌓였다"(0·null이면 안 그린다, 99 초과는 `99+`), `tag`는 "이 목적지가
아직 열리지 않았다"(`'준비 중'`)다. 함께 주면 **꼬리표가 먼저, 배지가 뒤**로 그려진다(준비 중이
처리 건수처럼 읽히지 않게). `tag` 글자는 버튼 접근명에 포함되므로 테스트·스크린리더가 보는 이름은
`"항목 이름 준비 중"`이 된다(색이나 점만으로 구별하게 두지 않는다). 이 조합의 계약은
`apps/web-admin/src/shared/__tests__/side-nav-tag-badge.test.tsx`가 고정한다.

`label`이 있는 그룹은 `role="group"` + `aria-labelledby`로 머리글과 항목이 묶여 렌더된다 —
스크린리더가 "운영 그룹"으로 읽고, 테스트는 `within(getByRole('group', { name: '운영' }))`으로
그룹 소속을 단언할 수 있다(머리글 유무만 보면 항목이 다른 그룹으로 옮겨가도 통과한다).

`activeKey`는 항목 `key`와 **완전 일치**로만 비교한다(DS는 경로 규칙을 모른다). 호출부가
pathname을 넘길 때는 꼬리 슬래시·하위 경로를 직접 정규화할 것 — `/sellers/`를 그대로 넘기면
`/sellers` 항목이 활성이 되지 않아 활성 스타일과 `aria-current`가 사라진다(web-seller
`AppShell`은 첫 세그먼트로, web-admin `__root`는 `navActiveKey`로 맞춘다).

| prop | 타입 |
|---|---|
| `groups` | `NavGroup[]` |
| `activeKey` | `string` |
| `onSelect` | `(key: string) => void` |
| `header` | `ReactNode` |
| `footer` | `ReactNode` |
| `collapsed` | `boolean` (기본값 `false`) |
| `onCollapsedChange` | `(collapsed: boolean) => void` |

`onCollapsedChange`를 넘기면 `SideNav`가 토글 버튼을 스스로 그린다 — 펼침
상태에서는 `header` 옆에 접기 버튼을, `collapsed=true`일 때는 `w-64` 전체 nav
대신 좁은 아이콘 레일(`w-14`)과 그 안의 펼치기 버튼만 그린다(nav 항목 라벨은
숨김). `onCollapsedChange` 없이 `collapsed`만 `true`로 주면 완전히 숨김(`null`,
하위 호환용 — 이 경우 호출부가 토글 버튼을 직접 만들어야 함).

---

## Skeleton

```tsx
<Skeleton variant="text" className="w-3/4" />
<Skeleton variant="circle" className="size-12" />
<Skeleton variant="rect" className="h-40 w-full" />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `variant` | `'text' \| 'circle' \| 'rect'` | `'rect'` |
| `className` | `string` | — |

크기는 `className`으로 제어. `width`/`height` prop 없음.

---

## StatusPill

```tsx
<StatusPill variant="success">판매중</StatusPill>
<StatusPill variant="warning" dot>경고</StatusPill>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `variant` | `'success' \| 'error' \| 'warning' \| 'info' \| 'danger' \| 'accent' \| 'brand' \| 'neutral' \| 'muted'` | `'neutral'` |
| `size` | `'sm' \| 'md'` | `'md'` |
| `dot` | `boolean` | `false` |
| `children` | `ReactNode` | **필수** |

`muted`는 "휴업/퇴점/블라인드/탈퇴 처리"처럼 `neutral`보다 한 단계 더 옅게 눈에 덜 띄어야 하는
비활성 상태에 쓰고, `danger`는 판매정지/영구정지/강제삭제 같은 되돌리기 어려운 제재 액션에 쓴다
(`error`는 단순 부정적 결과 — 반려/임시정지 등 — 에 사용, `danger`보다 약한 톤).

---

## TabBar

```tsx
<TabBar
  tabs={[
    { key: '/', label: '홈', icon: <Home className="size-full" /> },
    { key: '/market', label: '마켓', icon: <Store className="size-full" /> },
  ]}
  activeKey={pathname}
  onSelect={(key) => navigate({ to: key })}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `tabs` | `{ key: string; label: string; icon: ReactNode }[]` | **필수** |
| `activeKey` | `string` | **필수** |
| `onSelect` | `(key: string) => void` | **필수** |
| `className` | `string` | — |

앱 최하단 5-tab 셸 전용 바텀 네비게이션. `MobileScreen`의 `footer` 슬롯에 넣어 사용 (`BottomFixedAction`과 동일하게 `env(safe-area-inset-bottom)` 패딩 적용). **네이티브 `TabBar`와 다른 점:** `icon`이 `(isActive) => ReactNode` 렌더 프롭이 아니라 `ReactNode` 직접 전달 — 웹 아이콘(lucide-react)은 액티브/인액티브 전용 별도 글리프가 없고 `currentColor`/className으로 재색칠하기 때문. 라우팅은 컴포넌트가 직접 하지 않음 — `onSelect`에서 호출부가 TanStack Router `navigate`를 호출 (`SideNav`와 동일한 컨벤션).

---

## Tabs

```tsx
<Tabs
  tabs={[{ key: 'products', label: '상품' }, { key: 'about', label: '소개' }]}
  activeKey={activeKey}
  onSelect={setActiveKey}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `tabs` | `{ key: string; label: string; badge?: number \| string }[]` | **필수** |
| `activeKey` | `string` | **필수** |
| `onSelect` | `(key: string) => void` | **필수** |

페이지 내 콘텐츠 전환용 탭. 네비게이션이 필요하면 `SideNav` 사용 (`Tabs` ≠ `SideNav`). `badge`는 받은 값을 그대로 그리므로 천 단위 구분(`toLocaleString('ko-KR')`)은 호출부가 문자열로 넘긴다.

---

## Textarea

```tsx
<Textarea label="내용" maxLength={500} value={val} onChange={setVal} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `label` | `string` | — |
| `state` | `'default' \| 'error' \| 'success'` | `'default'` |
| `helperText` | `string` | — |
| `maxLength` | `number` | — |
| `onChange` | `(value: string) => void` | — |

**주의:** `onChange`는 `string` 직접 전달. Input과 다름 (`ChangeEvent` 아님).

---

## Timeline

```tsx
<Timeline steps={[
  { label: '결제완료', sublabel: '6/13', status: 'done' },
  { label: '배송중', sublabel: '6/14 / CJ대한통운 1234-5678', status: 'active' },
  { label: '배송완료', status: 'todo' },
]} />
```

```ts
interface TimelineStep {
  label: string
  sublabel?: string
  status: 'done' | 'active' | 'todo'
}
```

| prop | 타입 | 기본값 |
|---|---|---|
| `steps` | `TimelineStep[]` | **필수** |
| `className` | `string` | — |

세로 진행 타임라인(주문 배송추적/클레임 진행 등). `done`은 초록 점·연결선, `active`는 브랜드색 점·라벨,
`todo`는 옅은 회색. 네이티브 `Timeline`을 미러.

---

## Toast

```tsx
<Toast open={visible} onClose={() => setVisible(false)} message="저장되었습니다." variant="success" />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `open` | `boolean` | **필수** |
| `onClose` | `() => void` | **필수** |
| `message` | `ReactNode` | **필수** |
| `variant` | `'success' \| 'error' \| 'info' \| 'warning'` | `'info'` |
| `duration` | `number` (ms) | `3000` |

`duration` 경과 후 `onClose` 자동 호출. 조건부 렌더링 불필요 — `open` prop으로 제어.

---

## Toggle

```tsx
<Toggle label="알림 받기" checked={val} onChange={setVal} />
```

| prop | 타입 |
|---|---|
| `checked` | `boolean` |
| `onChange` | `(checked: boolean) => void` |
| `label` | `string` |
| `disabled` | `boolean` |
