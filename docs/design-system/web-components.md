# Web Design System Components

import 경로: `@aechak/design-system/web`

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
