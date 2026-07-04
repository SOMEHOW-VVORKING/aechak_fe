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
| `sortKey` | `string` | — |
| `sortDir` | `'asc' \| 'desc'` | — |
| `onSort` | `(key: string) => void` | — |
| `loading` | `boolean` | `false` |
| `emptyLabel` | `string` | `'데이터가 없습니다.'` |

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
<SideNav groups={groups} activeKey={key} onSelect={setKey} header={<Logo />} />
```

```ts
interface NavItem  { key: string; label: string; icon?: ReactNode; badge?: number }
interface NavGroup { label?: string; items: NavItem[] }
```

| prop | 타입 |
|---|---|
| `groups` | `NavGroup[]` |
| `activeKey` | `string` |
| `onSelect` | `(key: string) => void` |
| `header` | `ReactNode` |
| `footer` | `ReactNode` |

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
| `variant` | `'success' \| 'error' \| 'warning' \| 'info' \| 'brand' \| 'neutral'` | `'neutral'` |
| `size` | `'sm' \| 'md'` | `'md'` |
| `dot` | `boolean` | `false` |
| `children` | `ReactNode` | **필수** |

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
| `tabs` | `{ key: string; label: string; badge?: number }[]` | **필수** |
| `activeKey` | `string` | **필수** |
| `onSelect` | `(key: string) => void` | **필수** |

페이지 내 콘텐츠 전환용 탭. 네비게이션이 필요하면 `SideNav` 사용 (`Tabs` ≠ `SideNav`).

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
