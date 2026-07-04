# Native Design System Components

import 경로: `@aechak/design-system/native`

Safe area 처리: `useSafeAreaInsets()` 대신 `topInset` / `bottomInset` prop으로 주입.

---

## Accordion

```tsx
<Accordion title="배송/교환/반품 안내" defaultOpen={false}>
  <Text>본문 내용</Text>
</Accordion>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `title` | `string` | **필수** |
| `children` | `ReactNode` | **필수** |
| `defaultOpen` | `boolean` | `false` |
| `open` | `boolean` | — (제공 시 controlled) |
| `onToggle` | `(open: boolean) => void` | — |

`open`을 넘기지 않으면 내부 state로 비제어(uncontrolled) 동작. 넘기면 controlled로 동작하며 `onToggle`로 변경을 통지받음.

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

위치는 부모에서 `position: 'absolute'` 스타일로 처리. Badge 자체는 위치를 갖지 않음.

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

## Button

```tsx
<Button variant="primary" size="lg" onPress={handleLogin}>카카오로 시작하기</Button>
<Button variant="danger" loading>저장 중</Button>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'primary'` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `fullWidth` | `boolean` | `false` |
| `loading` | `boolean` | `false` |
| `disabled` | `boolean` | `false` |
| `leftIcon` | `ReactNode` | — |
| `rightIcon` | `ReactNode` | — |
| `onPress` | `() => void` | — |
| `children` | `ReactNode` | **필수** |

**웹 Button과 다른 점:** `onClick` 아닌 `onPress`. `ButtonHTMLAttributes` 확장 없음 — RN에는 해당 개념이 없어 필요한 prop만 명시적으로 선언.

---

## Card

```tsx
<Card padding="md" selected onPress={() => {}}>내용</Card>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `padding` | `'none' \| 'md'` | `'none'` |
| `selected` | `boolean` | — |
| `onPress` | `() => void` | — |

`onPress` 있으면 `Pressable`로 렌더링, 없으면 `View`.

**웹 Card와 다른 점:** `onClick` 아닌 `onPress`. `HTMLAttributes` 확장 없음.

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
<Chip label="전액사용" variant="brand" onPress={handleUseAll} />
<Chip label="필수" variant="outline" />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `label` | `string` | **필수** |
| `variant` | `'default' \| 'outline' \| 'brand'` | `'default'` |
| `icon` | `ReactNode` | — |
| `disabled` | `boolean` | — |
| `onPress` | `() => void` | — |

`onPress`가 있으면 `Pressable`(액션 칩), 없으면 `View`(정적 태그)로 렌더링. 선택 토글이 필요한 필터에는 [`FilterChip`](#filterchip) 사용.

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

## Input

```tsx
<Input label="이메일" placeholder="입력" value={val} onChangeText={setVal} />
<Input value={val} clearable onClear={() => setVal('')} onChangeText={setVal} />
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

나머지는 `TextInputProps` 그대로 전달됨 (`value`, `onChangeText`, `placeholder`, `secureTextEntry`, `keyboardType`, `editable` 등).

**웹 Input과 다른 점:** `onChange`(ChangeEvent) 대신 RN 관례인 `onChangeText: (text: string) => void` 사용. `disabled` 대신 `editable`.

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

**주의:** 취소 버튼은 항상 렌더링됨. 화면 중앙에 뜨는 확인 다이얼로그 — 바닥에서 올라오는 목록/선택 UI는 [`BottomSheet`](#bottomsheet) 사용.

---

## NumberInput

```tsx
<NumberInput value={qty} onChange={setQty} min={1} max={10} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `value` | `number` | **필수** |
| `onChange` | `(value: number) => void` | **필수** |
| `min` | `number` | `1` |
| `max` | `number` | `Infinity` |
| `step` | `number` | `1` |
| `disabled` | `boolean` | — |

수량 등 정수 스테퍼(-/+ 버튼) 입력에 사용.

---

## PhotoUpload

```tsx
<PhotoUpload photos={uris} onAdd={handlePickImage} onRemove={handleRemove} max={5} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `photos` | `string[]` | **필수** |
| `onAdd` | `() => void` | **필수** |
| `onRemove` | `(index: number) => void` | **필수** |
| `max` | `number` | `5` |
| `addIcon` | `ReactNode` | — |

이미지 선택(피커) 로직은 앱에서 구현 후 `onAdd`로 연결 — 디자인 시스템은 피커 라이브러리에 의존하지 않음.

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

## Radio

```tsx
<Radio label="옵션 A" value="a" checked={val === 'a'} onChange={() => setVal('a')} />
```

| prop | 타입 |
|---|---|
| `checked` | `boolean` |
| `onChange` | `() => void` |
| `label` | `string` |
| `name` | `string` |
| `value` | `string` |
| `disabled` | `boolean` |

**주의:** `name`/`value`는 웹 API와의 타입 일관성을 위해 존재 — RN에는 네이티브 라디오 그룹 개념이 없어 렌더링에는 사용되지 않음. 그룹 선택 로직은 부모(`checked === value`)에서 관리.

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
| `size` | `number` | `28` |
| `readonly` | `boolean` | — |

`onChange` 없거나 `readonly`면 별을 누를 수 없는 표시 전용 모드로 렌더링(별점 통계/리뷰 카드용). 이 모드는 `value`가 소수여도(예: `4.8`) 별이 부분적으로 채워짐 — 평균 별점이 5.0으로 오인되지 않도록 함. 반대로 입력 모드(`onChange` 전달)는 항상 정수 단위로 별을 탭해서 선택.

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

## SearchInput

```tsx
<SearchInput value={keyword} onChangeText={setKeyword} onClear={() => setKeyword('')} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `onClear` | `() => void` | — |

나머지는 `TextInputProps` 그대로 전달됨 (`value`, `onChangeText`, `placeholder`, `returnKeyType` 등 — `placeholder` 기본값 `'검색'`).

**웹과 다른 점:** 웹 문서에는 별도 SearchInput이 없음 — 네이티브에서는 검색 UI가 항상 알약(pill) 모양 + 좌측 아이콘 조합으로 반복되어 전용 컴포넌트로 분리. 일반 텍스트 입력에는 [`Input`](#input) 사용.

---

## SegmentedControl

```tsx
<SegmentedControl
  options={[{ value: 'all', label: '전체' }, { value: 'photo', label: '포토' }]}
  value={filter}
  onChange={setFilter}
/>
```

| prop | 타입 | 기본값 |
|---|---|---|
| `options` | `{ value: string; label: string }[]` | **필수** |
| `value` | `string` | **필수** |
| `onChange` | `(value: string) => void` | **필수** |
| `disabled` | `boolean` | — |

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
| `value` | `string` | — |
| `error` | `string` | — |
| `disabled` | `boolean` | — |
| `onChange` | `(value: string) => void` | — |

**웹 Select와 다른 점:** RN에는 네이티브 `<select>`가 없음 — 필드를 누르면 내부적으로 [`BottomSheet`](#bottomsheet)가 열려 옵션 목록을 보여주는 방식으로 구현. `SelectHTMLAttributes` 확장 없음.

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

## Textarea

```tsx
<Textarea label="리뷰 내용" maxLength={1000} value={val} onChange={setVal} />
```

| prop | 타입 | 기본값 |
|---|---|---|
| `label` | `string` | — |
| `state` | `'default' \| 'error' \| 'success'` | `'default'` |
| `helperText` | `string` | — |
| `maxLength` | `number` | — |
| `onChange` | `(value: string) => void` | — |

나머지는 `TextInputProps` 그대로 전달됨(`onChangeText`/`onChange` 제외 — `multiline` 고정).

**웹과 같은 점:** 웹 Textarea와 동일하게 `onChange`가 `string`을 직접 전달(원시 이벤트 아님) — 내부적으로 RN `TextInput`의 `onChangeText`에 매핑.

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
