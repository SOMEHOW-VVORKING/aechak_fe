# Native Design System Components

import 경로: `@aechak/design-system/native`

Safe area 처리: `useSafeAreaInsets()` 대신 `topInset` / `bottomInset` prop으로 주입.

---

## Alert

```tsx
<Alert variant="warning" title="주의" message="재고가 부족합니다." onDismiss={() => {}} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `variant` | `'info' \| 'warning' \| 'error' \| 'danger'` | `'info'` |
| `title` | `string` | — |
| `message` | `string` | **필수** |
| `onDismiss` | `() => void` | — |

**웹 Alert와 다른 점:** `children` 아닌 `message` prop 사용.

---

## AppBar

```tsx
<AppBar title="상품 상세" onBack={() => router.back()} topInset={insets.top} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `title` | `string` | — |
| `left` | `ReactNode` | — |
| `right` | `ReactNode` | — |
| `onBack` | `() => void` | — |
| `transparent` | `boolean` | `false` |
| `topInset` | `number` | `0` |

---

## Avatar

```tsx
<Avatar name="김지원" size="lg" />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `src` | `string` | — |
| `name` | `string` | — |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` |

---

## BottomBar

```tsx
<BottomBar
  primary={{ label: '구매하기', onPress: handleBuy }}
  secondary={{ label: '장바구니', onPress: handleCart }}
  bottomInset={insets.bottom}
/>
```

```ts
interface PrimaryAction   { label: string; onPress: () => void; disabled?: boolean }
interface SecondaryAction { label: string; onPress: () => void }
```

| prop | 타입 | 기본값 |
|---|---|---|
| `primary` | `PrimaryAction` | **필수** |
| `secondary` | `SecondaryAction` | — |
| `iconActions` | `ReactNode[]` | — |
| `bottomInset` | `number` | `0` |

---

## BottomSheet

```tsx
<BottomSheet visible={open} onClose={() => setOpen(false)} showGrabber>
  {/* 내용 */}
</BottomSheet>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `visible` | `boolean` | **필수** |
| `onClose` | `() => void` | **필수** |
| `children` | `ReactNode` | **필수** |
| `maxHeight` | `number` | — |
| `showGrabber` | `boolean` | `true` |

**주의:** `open` 아닌 `visible` prop 사용.

---

## EmptyState

```tsx
<EmptyState
  title="상품 없음"
  description="등록된 상품이 없습니다."
  action={{ label: '상품 등록', onPress: handleAdd }}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `title` | `string` | **필수** |
| `icon` | `ReactNode` | — |
| `description` | `string` | — |
| `action` | `{ label: string; onPress: () => void }` | — |

**웹과 다른 점:** `action.onClick` → `action.onPress`

---

## FilterChip

```tsx
<FilterChip label="최신순" selected={selected} onPress={() => setSelected(!selected)} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `label` | `string` | **필수** |
| `selected` | `boolean` | `false` |
| `onPress` | `() => void` | **필수** |
| `icon` | `ReactNode` | — |

---

## ProductCard

```tsx
<ProductCard
  image="https://..."
  name="프리미엄 케이크"
  price={45000}
  originalPrice={55000}
  storeName="달콤제과"
  isSold={false}
  onPress={handlePress}
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
| `onPress` | `() => void` | — |

할인율은 내부에서 자동 계산. 가격 포맷은 `toLocaleString('ko-KR') + '원'`.

---

## ReviewCard

```tsx
<ReviewCard
  author="홍길동"
  rating={4}
  date="2026.07.04"
  content="맛있어요!"
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

---

## Skeleton

```tsx
<Skeleton width="100%" height={20} radius="md" />
<Skeleton width={48} height={48} radius="full" />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `width` | `number \| \`${number}%\`` | `'100%'` |
| `height` | `number` | `16` |
| `radius` | `'sm' \| 'md' \| 'full'` | `'md'` |
| `style` | `ViewStyle` | — |

**웹 Skeleton과 다른 점:** `width`/`height` prop으로 크기 제어. `variant` 없음.

---

## StatusPill

```tsx
<StatusPill variant="success">판매중</StatusPill>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `variant` | `'success' \| 'error' \| 'warning' \| 'info' \| 'brand' \| 'neutral'` | `'neutral'` |
| `size` | `'sm' \| 'md'` | `'md'` |
| `dot` | `boolean` | `false` |
| `children` | `ReactNode` | **필수** |

---

## StepProgress

```tsx
<StepProgress current={2} total={4} />
```

| prop | 타입 |
|---|---|
| `current` | `number` |
| `total` | `number` |

`current`번째 세그먼트가 활성(brand), 이전은 완료(success), 이후는 미완.

---

## TabBar

```tsx
<TabBar
  tabs={[
    { key: 'home', label: '홈', icon: (isActive) => <HomeIcon color={isActive ? '#2A8240' : '#999'} /> },
  ]}
  activeKey={activeTab}
  onSelect={setActiveTab}
  bottomInset={insets.bottom}
/>
```

```ts
interface TabItem {
  key: string
  label: string
  icon: (isActive: boolean) => ReactNode  // ← 함수형 render prop
}
```

| prop | 타입 | 기본값 |
|---|---|---|
| `tabs` | `TabItem[]` | **필수** |
| `activeKey` | `string` | **필수** |
| `onSelect` | `(key: string) => void` | **필수** |
| `bottomInset` | `number` | `0` |

**주의:** `icon`은 `ReactNode`가 아닌 `(isActive: boolean) => ReactNode` 함수.

---

## Timeline

```tsx
<Timeline steps={[
  { label: '주문 접수', status: 'done' },
  { label: '배송 중', sublabel: '2026.07.04 14:00', status: 'active' },
  { label: '배송 완료', status: 'todo' },
]} />
```

```ts
interface TimelineStep {
  label: string
  sublabel?: string
  status: 'done' | 'active' | 'todo'
}
```

---

## Toast

```tsx
<Toast message="저장되었습니다." variant="success" duration={3000} onHide={() => setVisible(false)} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `message` | `string` | **필수** |
| `variant` | `'error' \| 'success' \| 'info' \| 'brand'` | `'brand'` |
| `duration` | `number` (ms) | `3000` |
| `onHide` | `() => void` | — |

**웹 Toast와 다른 점:** `open`/`onClose` 없음. 마운트되는 순간 애니메이션 시작 → `duration` 후 `onHide` 호출. 조건부 렌더링으로 제어.
