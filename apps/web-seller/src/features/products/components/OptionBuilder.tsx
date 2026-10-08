import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, Chip, DataTable, Input, Toggle, type Column } from '@aechak/design-system/web'
import { Field, FieldError } from '@/shared/components/Field'
import {
  buildCombinations,
  type CombinationRow,
  type OptionGroupRequest,
  type ProductFormErrors,
  type ProductFormValues,
} from '../products.contract'
import { FieldAnchor, fieldA11y, fieldHelperId } from './FieldAnchor'

type OptionValue = Pick<ProductFormValues, 'optionEnabled' | 'optionGroups' | 'combinations' | 'defaultStock'>

interface OptionBuilderProps {
  value: OptionValue
  errors: ProductFormErrors
  /** 안내 말풍선을 띄울 첫 오류 필드 키(에디터 소유). */
  tooltipKey: string | null
  onChange: (patch: Partial<OptionValue>) => void
}

const MAX_GROUPS = 3
const digitsOnly = (value: string) => value.replace(/\D/g, '')

// 목업의 옵션 사용 토글 하나로 단일/조합 옵션을 함께 다룬다 — 둘은 그룹 수만 다르다.
export function OptionBuilder({ value, errors, tooltipKey, onChange }: OptionBuilderProps) {
  const [valueInputs, setValueInputs] = useState<Record<number, string>>({})
  // 같은 그룹 안 중복을 거른 그룹 index — 조용히 버리면 추가가 됐는지 알 수 없어 한 줄 안내한다.
  const [duplicateGroup, setDuplicateGroup] = useState<number | null>(null)
  const { optionEnabled, optionGroups, combinations } = value

  // 빈 그룹이 잠깐 생기면 조합이 []가 된다 — 그동안 입력한 추가금/재고를 잃지 않도록 본 행을 모두 기억해 둔다.
  const rowCache = useRef(new Map<string, CombinationRow>())

  const tipFor = (key: string) => (tooltipKey === key ? errors[key] : undefined)
  const a11y = (key: string, hasHelper?: boolean) => fieldA11y(key, errors, tooltipKey, hasHelper)

  function setGroups(groups: OptionGroupRequest[]) {
    combinations.forEach(row => rowCache.current.set(row.key, row))
    onChange({ optionGroups: groups, combinations: buildCombinations(groups, [...rowCache.current.values()]) })
  }

  function handleToggle(next: boolean) {
    if (next && optionGroups.length === 0) {
      onChange({ optionEnabled: true, optionGroups: [{ name: '', values: [] }], combinations: [] })
    } else {
      onChange({ optionEnabled: next })
    }
  }

  function addValue(index: number) {
    const text = (valueInputs[index] ?? '').trim()
    if (!text) return
    // 같은 그룹 안 중복은 칩 목록이 집합(React key=값)이라 FE가 먼저 거르고 입력을 남겨 알린다.
    // 그룹을 넘는 중복은 BE가 40005로 알려 준다.
    if (optionGroups.some((g, i) => i === index && g.values.includes(text))) {
      setDuplicateGroup(index)
      return
    }
    setGroups(optionGroups.map((g, i) => (i === index ? { ...g, values: [...g.values, text] } : g)))
    setValueInputs(prev => ({ ...prev, [index]: '' }))
    setDuplicateGroup(null)
  }

  function removeGroup(index: number) {
    setGroups(optionGroups.filter((_, i) => i !== index))
    // 입력 중이던 값은 그룹 순번이 밀리므로 버린다.
    setValueInputs({})
    setDuplicateGroup(null)
  }

  function patchCombination(key: string, patch: Partial<CombinationRow>) {
    onChange({ combinations: combinations.map(row => (row.key === key ? { ...row, ...patch } : row)) })
  }

  const indexByKey = new Map(combinations.map((row, j) => [row.key, j]))
  const invalidRowCount = combinations.filter(
    (_, j) => errors[`combination-${j}-additionalPrice`] || errors[`combination-${j}-stockQuantity`],
  ).length
  const labelOf = (row: CombinationRow) => row.optionValues.join(' / ')

  const columns: Column<CombinationRow>[] = [
    { key: 'option', label: '옵션', render: labelOf },
    {
      key: 'additionalPrice',
      label: '추가 금액',
      align: 'right',
      render: row => {
        const key = `combination-${indexByKey.get(row.key)}-additionalPrice`
        return (
          <FieldAnchor fieldKey={key} tip={tipFor(key)}>
            <div className="ml-auto w-36">
              <Input
                inputMode="numeric"
                rightAddon="원"
                aria-label={`${labelOf(row)} 추가 금액`}
                {...a11y(key, false)}
                state={errors[key] ? 'error' : 'default'}
                value={row.additionalPrice}
                onChange={e => patchCombination(row.key, { additionalPrice: digitsOnly(e.target.value) })}
              />
            </div>
          </FieldAnchor>
        )
      },
    },
    {
      key: 'stockQuantity',
      label: '재고',
      align: 'right',
      render: row => {
        const key = `combination-${indexByKey.get(row.key)}-stockQuantity`
        return (
          <FieldAnchor fieldKey={key} tip={tipFor(key)}>
            <div className="ml-auto w-28">
              <Input
                inputMode="numeric"
                aria-label={`${labelOf(row)} 재고`}
                {...a11y(key, false)}
                state={errors[key] ? 'error' : 'default'}
                value={row.stockQuantity}
                onChange={e => patchCombination(row.key, { stockQuantity: digitsOnly(e.target.value) })}
              />
            </div>
          </FieldAnchor>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-1">
        <Toggle label="옵션 사용" checked={optionEnabled} onChange={handleToggle} />
        <p className="text-caption text-text-tertiary">용량, 색상처럼 옵션별로 재고를 관리해요.</p>
      </div>

      {!optionEnabled ? (
        <FieldAnchor fieldKey="defaultStock" tip={tipFor('defaultStock')}>
          <div className="w-48">
            <Input
              label="재고"
              inputMode="numeric"
              {...a11y('defaultStock')}
              state={errors['defaultStock'] ? 'error' : 'default'}
              helperText={errors['defaultStock']}
              value={value.defaultStock}
              onChange={e => onChange({ defaultStock: digitsOnly(e.target.value) })}
            />
          </div>
        </FieldAnchor>
      ) : (
        <>
          {optionGroups.map((group, i) => {
            const nameKey = `optionGroup-${i}-name`
            const valuesKey = `optionGroup-${i}-values`
            return (
              <div key={i} className="flex flex-col gap-3 rounded-card border border-border-subtle p-4">
                <div className="flex items-start gap-3">
                  <div className="w-56">
                    <FieldAnchor fieldKey={nameKey} tip={tipFor(nameKey)}>
                      <Input
                        label={`옵션명 ${i + 1}`}
                        maxLength={100}
                        {...a11y(nameKey)}
                        state={errors[nameKey] ? 'error' : 'default'}
                        helperText={errors[nameKey]}
                        value={group.name}
                        onChange={e =>
                          setGroups(optionGroups.map((g, gi) => (gi === i ? { ...g, name: e.target.value } : g)))
                        }
                      />
                    </FieldAnchor>
                  </div>
                  <div className="flex-1">
                    <FieldAnchor fieldKey={valuesKey} tip={tipFor(valuesKey)}>
                      <Field label="옵션값">
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <Input
                              aria-label={`옵션값 ${i + 1} 입력`}
                              {...a11y(valuesKey)}
                              {...(duplicateGroup === i ? { 'aria-describedby': fieldHelperId(valuesKey) } : {})}
                              maxLength={100}
                              placeholder="예: 화이트"
                              state={errors[valuesKey] ? 'error' : 'default'}
                              value={valueInputs[i] ?? ''}
                              onChange={e => {
                                setValueInputs(prev => ({ ...prev, [i]: e.target.value }))
                                if (duplicateGroup === i) setDuplicateGroup(null)
                              }}
                              onKeyDown={e => {
                                // 한글 조합 중 Enter는 글자 확정용이라 추가하지 않는다.
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                  e.preventDefault()
                                  addValue(i)
                                }
                              }}
                            />
                          </div>
                          <Button variant="secondary" onClick={() => addValue(i)}>
                            추가
                          </Button>
                        </div>
                        {(duplicateGroup === i || errors[valuesKey]) && (
                          <FieldError id={fieldHelperId(valuesKey)}>
                            {duplicateGroup === i ? '이미 있는 옵션값이에요' : errors[valuesKey]}
                          </FieldError>
                        )}
                      </Field>
                    </FieldAnchor>
                  </div>
                  {/* 마지막 그룹은 지우지 않고 옵션 사용을 끈다(그룹 0개로 켜진 상태를 만들지 않음). */}
                  {optionGroups.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-7"
                      aria-label={`옵션 ${i + 1} 삭제`}
                      onClick={() => removeGroup(i)}
                    >
                      삭제
                    </Button>
                  )}
                </div>
                {group.values.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {group.values.map(v => (
                      <Chip
                        key={v}
                        onRemove={() =>
                          setGroups(
                            optionGroups.map((g, gi) => (gi === i ? { ...g, values: g.values.filter(x => x !== v) } : g)),
                          )
                        }
                      >
                        {v}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex items-center justify-between">
            <span className="text-caption text-text-tertiary">
              {optionGroups.length > 1 ? `조합 옵션 / ${combinations.length}개 조합` : '단일 옵션'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus className="size-4" />}
              disabled={optionGroups.length >= MAX_GROUPS}
              onClick={() => setGroups([...optionGroups, { name: '', values: [] }])}
            >
              옵션 추가
            </Button>
          </div>

          {/* 셀마다 문구를 두면 행 높이가 늘어나 표 위에 요약으로 알린다(셀은 테두리 + aria-invalid). */}
          {invalidRowCount > 0 && (
            <FieldError>추가 금액이나 재고를 입력하지 않은 조합이 {invalidRowCount}개 있어요</FieldError>
          )}
          {combinations.length > 0 && <DataTable columns={columns} rows={combinations} rowKey={row => row.key} />}
        </>
      )}
    </div>
  )
}
