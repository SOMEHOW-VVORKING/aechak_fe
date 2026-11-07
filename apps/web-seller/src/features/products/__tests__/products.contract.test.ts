import { describe, it, expect } from 'vitest'
import type { InspectionStage } from '@aechak/api'
import {
  applyAutofillDraft,
  autofillFieldNotices,
  autofillMode,
  buildCombinations,
  discountRate,
  emptyProductForm,
  inspectionStageRows,
  productErrorMessage,
  toDraftRequest,
  toFormValues,
  toRegisterRequest,
  toUpdateRequest,
  validateProductForm,
  type ProductDraft,
  type ProductDraftAutofillResult,
  type ProductFormValues,
} from '../products.contract'

const thumbnail = [{ id: 't', previewUrl: 'blob:t', imageKey: 'tmp/1/products/1.png', file: null }]

/** 초안 응답은 중첩 목록이 항상 배열이다(요청에서는 nullable) — 테스트가 그 모양을 지어낸다. */
function draftOf(patch: Partial<ProductDraft> = {}): ProductDraft {
  return {
    draftId: 'd1',
    savedAt: '2026-10-01T00:00:00',
    additionalImageKeys: [],
    detailImageKeys: [],
    optionGroups: [],
    optionCombinations: [],
    ...patch,
  }
}

function validForm(patch: Partial<ProductFormValues> = {}): ProductFormValues {
  return {
    ...emptyProductForm(),
    productName: '테스트 상품',
    categoryIds: [2, 209, 20901],
    regularPrice: '15000',
    thumbnail,
    defaultStock: '10',
    ...patch,
  }
}

describe('validateProductForm', () => {
  it('[AC-SPRD-001] 빈 폼은 화면 순서대로 필수 항목 오류를 낸다', () => {
    expect(Object.keys(validateProductForm(emptyProductForm()))).toEqual([
      'productName',
      'categoryId',
      'regularPrice',
      'thumbnail',
      'defaultStock',
    ])
    expect(validateProductForm(validForm())).toEqual({})
    // 수정(PUT)은 옵션/재고를 받지 않아 검증하지 않는다.
    expect(validateProductForm(validForm({ defaultStock: '' }), false)).toEqual({})
  })

  it('[AC-SPRD-001] 할인/옵션의 필수 칸만 보고, 범위/중복 규칙은 BE 응답에 맡긴다', () => {
    // 정가 범위, 할인가 > 정가, 종료일 < 시작일은 BE가 40001/40002로 거절한다 — 여기서는 오류가 아니다.
    expect(validateProductForm(validForm({ regularPrice: '99' }))).toEqual({})
    const discount = { discountEnabled: true, discountStartDate: '2026-10-01' }
    expect(
      validateProductForm(validForm({ ...discount, discountPrice: '16000', discountEndDate: '2026-09-30' })),
    ).toEqual({})
    expect(validateProductForm(validForm({ ...discount, discountPrice: '', discountStartDate: '' }))).toEqual({
      discountPrice: '할인가를 입력해 주세요',
      discountStartDate: '할인 시작일을 선택해 주세요',
    })

    // 옵션명 중복은 BE 40005 — 빈 옵션명/옵션값만 본다.
    const options = {
      optionEnabled: true,
      optionGroups: [
        { name: '색상', values: ['화이트'] },
        { name: '색상', values: ['블랙'] },
        { name: ' ', values: [] },
      ],
      combinations: [{ key: 'k', optionValues: ['화이트'], additionalPrice: '', stockQuantity: '' }],
    }
    expect(validateProductForm(validForm(options))).toEqual({
      'optionGroup-2-name': '옵션명을 입력해 주세요',
      'optionGroup-2-values': '옵션값을 1개 이상 추가해 주세요',
      'combination-0-additionalPrice': '추가 금액을 입력해 주세요',
      'combination-0-stockQuantity': '재고를 입력해 주세요',
    })

    // 2^53 이상은 Number()가 다른 값으로 바꿔 보내므로(전송 손실) 서버 규칙과 별개로 막는다.
    const huge = { ...options, optionGroups: [{ name: '색상', values: ['화이트'] }] }
    expect(
      validateProductForm(
        validForm({ ...huge, combinations: [{ key: 'k', optionValues: ['화이트'], additionalPrice: '9007199254740993', stockQuantity: '1' }] }),
      ),
    ).toEqual({ 'combination-0-additionalPrice': '추가 금액이 너무 커요' })
  })
})

describe('toFormValues', () => {
  it('[AC-SPRD-005] 할인가 없이 할인 기간만 저장한 임시저장은 할인 토글을 켠 채로 연다', () => {
    const values = toFormValues(
      draftOf({ discountStartAt: '2026-10-10T00:00:00' }),
      [],
      key => `url:${key}`,
    )
    expect(values.discountEnabled).toBe(true)
    expect(values.discountStartDate).toBe('2026-10-10')
  })

  it('[AC-SPRD-005] 수정 프리필의 저장 키는 imageKey로 두고 미리보기는 주입한 URL로 만든다', () => {
    const values = toFormValues(
      {
        productId: 'p1',
        categoryId: 20901,
        productName: '급식기',
        description: null,
        regularPrice: 15000,
        discountPrice: null,
        discountStartAt: null,
        discountEndAt: null,
        thumbnailImageKey: 'products/A.png',
        additionalImageKeys: ['products/B.png'],
        detailImageKeys: [],
        // 서버 단건 조회는 요청 DTO에 없는 두 상태를 더 준다(프리필에는 쓰지 않는다).
        saleStatus: 'ON_SALE',
        inspectionStatus: 'APPROVED',
      },
      [],
      key => `url:${key}`,
    )
    expect(values.thumbnail).toEqual([{ id: 'products/A.png', previewUrl: 'url:products/A.png', imageKey: 'products/A.png', file: null }])
    expect(values.additionalImages[0]?.imageKey).toBe('products/B.png')
    expect(values.optionEnabled).toBe(false)
  })
})

describe('buildCombinations', () => {
  it('[AC-SPRD-002] 그룹 순서대로 곱집합을 만들고 기존 행 값을 유지한다', () => {
    const single = buildCombinations([{ name: '사이즈', values: ['S', 'M', 'L'] }], [])
    expect(single.map(r => r.optionValues)).toEqual([['S'], ['M'], ['L']])

    const groups = [
      { name: '색상', values: ['레드', '블루'] },
      { name: '사이즈', values: ['S', 'M'] },
    ]
    const grid = buildCombinations(groups, [])
    expect(grid.map(r => r.optionValues)).toEqual([
      ['레드', 'S'],
      ['레드', 'M'],
      ['블루', 'S'],
      ['블루', 'M'],
    ])
    expect(grid[0]).toMatchObject({ additionalPrice: '0', stockQuantity: '' })

    const edited = grid.map((r, i) => ({ ...r, stockQuantity: String(i), additionalPrice: '500' }))
    const grown = buildCombinations([groups[0]!, { name: '사이즈', values: ['S', 'M', 'L'] }], edited)
    expect(grown).toHaveLength(6)
    expect(grown[1]).toMatchObject({ optionValues: ['레드', 'M'], stockQuantity: '1', additionalPrice: '500' })
    expect(grown[2]).toMatchObject({ optionValues: ['레드', 'L'], additionalPrice: '0', stockQuantity: '' })
  })

  it('[AC-SPRD-002] 값이 없는 그룹이 있으면 조합이 없다', () => {
    expect(buildCombinations([{ name: '색상', values: ['화이트'] }, { name: '사이즈', values: [] }], [])).toEqual([])
  })
})

describe('toRegisterRequest', () => {
  it('[AC-SPRD-003] 옵션/할인을 끄면 BE 옵션 없는 상품 형태(그룹 null + 기본 조합 하나)와 할인 null 셋을 보낸다', () => {
    const body = toRegisterRequest(validForm({ description: '  ' }))
    expect(body.optionGroups).toBeNull()
    expect(body.optionCombinations).toEqual([{ optionValues: [], additionalPrice: 0, stockQuantity: 10 }])
    expect(body).toMatchObject({
      categoryId: 20901,
      regularPrice: 15000,
      description: null,
      discountPrice: null,
      discountStartAt: null,
      discountEndAt: null,
      thumbnailImageKey: 'tmp/1/products/1.png',
    })
  })

  it('[AC-SPRD-003] 할인 날짜는 오프셋 없는 LocalDateTime 하루 시작/끝으로, 빈 종료일은 null로 보낸다', () => {
    const on = { discountEnabled: true, discountPrice: '12500', discountStartDate: '2026-10-01' }
    expect(toRegisterRequest(validForm({ ...on, discountEndDate: '2026-10-31' }))).toMatchObject({
      discountPrice: 12500,
      discountStartAt: '2026-10-01T00:00:00',
      discountEndAt: '2026-10-31T23:59:59',
    })
    expect(toRegisterRequest(validForm(on)).discountEndAt).toBeNull()
    expect(discountRate(15000, 12500)).toBe(17)
  })

  it('[AC-SPRD-003] 수정 본문은 옵션 필드 없이 보내고 한 목록 안 중복 키를 뺀다', () => {
    const slot = (imageKey: string) => ({ id: imageKey, previewUrl: '', imageKey, file: null })
    const body = toUpdateRequest(
      validForm({ additionalImages: [slot('products/A.png'), slot('products/A.png')], detailImages: [slot('products/A.png')] }),
    )
    expect(body).not.toHaveProperty('optionGroups')
    expect(body).not.toHaveProperty('optionCombinations')
    expect(body.additionalImageKeys).toEqual(['products/A.png'])
    expect(body.detailImageKeys).toEqual(['products/A.png'])
  })

  it('[AC-SPRD-003] 할인 날짜를 그대로 두고 수정하면 기존 할인 시각을 보존하고 바꾼 날짜만 하루 시작/끝으로 보낸다', () => {
    const prefilled = toFormValues(
      {
        productId: 'p1',
        categoryId: 20901,
        productName: '급식기',
        description: null,
        regularPrice: 15000,
        discountPrice: 12000,
        discountStartAt: '2026-10-01T15:30:00',
        discountEndAt: '2026-10-31T18:00:00',
        thumbnailImageKey: 'products/A.png',
        additionalImageKeys: [],
        detailImageKeys: [],
        saleStatus: 'ON_SALE',
        inspectionStatus: 'APPROVED',
      },
      [],
      key => key,
    )
    expect(toUpdateRequest({ ...prefilled, categoryIds: [2, 209, 20901] })).toMatchObject({
      discountStartAt: '2026-10-01T15:30:00',
      discountEndAt: '2026-10-31T18:00:00',
    })
    expect(
      toUpdateRequest({ ...prefilled, categoryIds: [2, 209, 20901], discountEndDate: '2026-11-15' }),
    ).toMatchObject({ discountStartAt: '2026-10-01T15:30:00', discountEndAt: '2026-11-15T23:59:59' })
  })
})

describe('toDraftRequest', () => {
  it('[AC-SPRD-006] 재고를 비운 조합도 입력한 추가 금액은 임시저장하고 이어쓰기에서 되살린다', () => {
    const groups = [{ name: '용량', values: ['1kg', '2kg'] }]
    const combinations = buildCombinations(groups, []).map((row, i) =>
      i === 0 ? { ...row, additionalPrice: '500' } : row,
    )
    const draft = toDraftRequest(validForm({ optionEnabled: true, optionGroups: groups, combinations }))
    expect(draft.optionCombinations).toEqual([
      { optionValues: ['1kg'], additionalPrice: 500 },
      { optionValues: ['2kg'], additionalPrice: 0 },
    ])
    const resumed = toFormValues(
      draftOf({
        productName: draft.productName,
        regularPrice: draft.regularPrice,
        optionGroups: draft.optionGroups ?? [],
        optionCombinations: draft.optionCombinations ?? [],
      }),
      [],
      key => key,
    )
    expect(resumed.combinations[0]).toMatchObject({ optionValues: ['1kg'], additionalPrice: '500', stockQuantity: '' })
  })

  it('[AC-SPRD-037] 비운 칸은 키째 빠진다 — PUT이 통째로 덮어쓰므로 그것이 "비움"이다', () => {
    const body = toDraftRequest({
      ...emptyProductForm(),
      productName: '  하네스  ',
      // 할인 토글이 꺼져 있으면 입력해 둔 할인가도 싣지 않는다.
      discountEnabled: false,
      discountPrice: '1000',
    })
    expect(body).toEqual({ productName: '하네스' })
  })

  it('[AC-SPRD-066] 초안의 null 재고와 빈 그룹명을 폼 값으로 되살린다', () => {
    // 옵션 없이 재고만 비운 초안 — String(null)이 새면 '재고 null'이 폼에 보인다.
    const resumed = toFormValues(
      draftOf({ optionCombinations: [{ optionValues: [], additionalPrice: 0, stockQuantity: null }] }),
      [],
      key => key,
    )
    expect(resumed.defaultStock).toBe('')

    // 그룹명을 아직 안 적은 초안. 폼은 문자열만 다루므로 빈 문자열로 내려와야 한다.
    const withGroup = toFormValues(
      draftOf({ optionGroups: [{ name: null, values: ['1kg'] }] }),
      [],
      key => key,
    )
    expect(withGroup.optionGroups).toEqual([{ name: '', values: ['1kg'] }])
  })
})

describe('productErrorMessage', () => {
  const error = (status: number, errorCode: number) => ({ response: { status, data: { errorCode, message: 'x' } } })

  it('[AC-SPRD-004] BE errorCode별 FE 문구를 돌려준다', () => {
    const fallback = '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
    // 40400·40401은 임시저장 전용 코드다(ProductErrorCode PRODUCT_DRAFT_NOT_FOUND / _LIMIT_EXCEEDED).
    for (const code of [40000, 40001, 40002, 40003, 40004, 40005, 40100, 40101, 40200, 40201, 40400, 40401, 90001, 90003, 100000, 100002]) {
      expect(productErrorMessage(error(400, code))).not.toBe(fallback)
    }
    expect(productErrorMessage(error(400, 40003))).toBe(
      '이미지 수를 확인해 주세요. 추가 썸네일은 9장, 상세 이미지는 20장까지 올릴 수 있어요.',
    )
    // 90003(동시 수정)은 409지만 판매 이력 같은 다른 뜻으로 읽지 않는다.
    expect(productErrorMessage(error(409, 90003))).toBe('다른 곳에서 먼저 수정했어요. 새로고침 후 다시 시도해 주세요.')
    // 90002(INVALID_CURSOR)는 셀러 상품 API가 보내지 않는다.
    expect(productErrorMessage(error(400, 90002))).toBe(fallback)
    expect(productErrorMessage(error(422, 40401))).toBe(
      '임시저장은 10개까지 보관할 수 있어요. 쓰지 않는 임시저장을 지운 뒤 다시 시도해 주세요.',
    )
    expect(productErrorMessage(new Error('network'))).toBe(fallback)
  })
})

describe('inspectionStageRows', () => {
  const unknownStage = (detail: string | null = null) =>
    ({
      stage: 'IMAGE' as InspectionStage['stage'],
      outcome: 'PARTIAL' as InspectionStage['outcome'],
      detail,
    }) satisfies InspectionStage

  it('[AC-SPRD-109] 받은 단계를 그대로 세 줄로 접고, 모르는 값도 와이어 글자로 내보내지 않는다', () => {
    const stages = [
      { stage: 'RULE', outcome: 'VIOLATION', detail: null },
      { stage: 'TRIAGE', outcome: 'UNCHECKED', detail: '앞 단계에서 이미 걸려 더 보지 않았어요' },
      // BE가 단계나 결과를 늘려도 화면에 영문이 새지 않아야 한다.
      unknownStage(),
    ] satisfies InspectionStage[]

    const rows = inspectionStageRows(stages)

    expect(rows.map(r => r.label)).toEqual(['자동 규칙 검사', '1차 선별', '그 밖의 단계'])
    expect(rows.map(r => r.outcomeLabel)).toEqual(['걸렸어요', '안 돌았어요', '결과를 읽지 못했어요'])
    // 주의·흐림만 쓰고 모르는 결과는 강조하지 않는다.
    expect(rows.map(r => r.tone)).toEqual(['warning', 'muted', 'muted'])
    expect(rows[1]?.detail).toBe('앞 단계에서 이미 걸려 더 보지 않았어요')
    // 필드가 없는 응답(이 기능 전 배포)에서는 영역이 접힌다.
    expect(inspectionStageRows(undefined)).toEqual([])
  })

  it('[AC-SPRD-112] 모르는 단계가 둘이어도 줄 키가 겹치지 않는다', () => {
    // 폴백이 쓰이는 상황이 바로 BE가 단계를 늘릴 때다 -- 키가 겹치면 React가 잘못 재조정한다.
    const rows = inspectionStageRows([unknownStage(), unknownStage()])

    expect(new Set(rows.map(r => r.key)).size).toBe(2)
  })

  it('[AC-SPRD-113] 사유는 UNCHECKED에서만 흘리고 걸림·통과에 실린 값은 버린다', () => {
    const rows = inspectionStageRows([
      // 계약은 "VIOLATION·CLEAR는 null"이지만 믿기만 하면 서버가 단 내부 값이 화면에 그대로 뜬다.
      { stage: 'RULE', outcome: 'VIOLATION', detail: 'RATE_LIMITED' },
      { stage: 'TRIAGE', outcome: 'CLEAR', detail: 'perspective=DISPLAY_ADS' },
      { stage: 'MODEL', outcome: 'UNCHECKED', detail: '요청이 몰려 잠시 뒤 다시 봐요' },
    ])

    expect(rows.map(r => r.detail)).toEqual([null, null, '요청이 몰려 잠시 뒤 다시 봐요'])
  })

  it('[AC-SPRD-114] "돌지 않았어요"와 "아직 닿지 않았어요"를 둘 다 그대로 받는다', () => {
    // 서버가 가르는 문장이다(판정이 끝났으면 "돌지 않았어요", 진행 중이면 "아직 닿지 않았어요").
    // FE에 번역표를 두면 두 벌이 어긋나므로 받은 문장을 글자 그대로 내려보내기만 한다.
    const detailOf = (detail: string) =>
      inspectionStageRows([{ stage: 'TRIAGE', outcome: 'UNCHECKED', detail }])[0]?.detail

    expect(detailOf('이 단계는 돌지 않았어요')).toBe('이 단계는 돌지 않았어요')
    expect(detailOf('아직 이 단계에 닿지 않았어요')).toBe('아직 이 단계에 닿지 않았어요')
    // skipReason에서 온 문장도 같은 길로 온다.
    expect(detailOf('요청이 몰려 잠시 뒤 다시 봐요')).toBe('요청이 몰려 잠시 뒤 다시 봐요')
    expect(detailOf('모델이 판단을 거부했어요')).toBe('모델이 판단을 거부했어요')
  })
})

describe('초안 모드와 비운 사유', () => {
  const formWith = (description: string): ProductFormValues => ({ ...emptyProductForm(), description })

  it('[AC-SPRD-110] 설명이 비어 있으면 FILL, 차 있으면 REFINE이다', () => {
    expect(autofillMode(formWith(''))).toBe('FILL')
    // 공백만 쓴 칸은 다시 쓸 본문이 아니다.
    expect(autofillMode(formWith('   '))).toBe('FILL')
    expect(autofillMode(formWith('직접 쓴 설명'))).toBe('REFINE')
  })

  it('[AC-SPRD-111] 안내할 두 값만 칸별 문구로 접고 모르는 값은 버린다', () => {
    expect(
      autofillFieldNotices({
        categoryId: 'EMPTY_CALL_FAILED',
        description: 'EMPTY_MODEL_DECLINED',
        optionGroups: 'EMPTY_NOT_ATTEMPTED',
        regularPrice: 'EMPTY_CALL_FAILED',
      }),
    ).toEqual({
      category: '불러오지 못했어요. 다시 시도해 주세요',
      description: '직접 작성해 주세요',
    })
    // 옵션 칸은 와이어 필드가 둘이고 앞선 쪽이 남는다.
    expect(autofillFieldNotices({ optionCombinations: 'EMPTY_MODEL_DECLINED' })).toEqual({
      options: '직접 작성해 주세요',
    })
    expect(autofillFieldNotices({ description: 'FILLED' })).toEqual({})
    expect(autofillFieldNotices(undefined)).toEqual({})
  })

  it('[AC-SPRD-115] REFINE에서 다시 쓰지 못한 본문만 KEPT_LOCKED를 안내한다', () => {
    expect(autofillFieldNotices({ description: 'KEPT_LOCKED' }, 'REFINE')).toEqual({
      description: '본문을 다시 쓰지 못해 그대로 두었어요',
    })
    // FILL의 KEPT_LOCKED는 "쓴 칸을 비켜 갔다"는 정상 동작이라 말할 것이 없다(기본 모드도 FILL이다).
    expect(autofillFieldNotices({ description: 'KEPT_LOCKED' }, 'FILL')).toEqual({})
    expect(autofillFieldNotices({ description: 'KEPT_LOCKED' })).toEqual({})
    // 옵션은 REFINE에서도 손대지 않기로 한 자리라 그대로 둔 것이 사고가 아니다.
    expect(autofillFieldNotices({ optionGroups: 'KEPT_LOCKED' }, 'REFINE')).toEqual({})
  })
})

describe('applyAutofillDraft', () => {
  const SELLER_TEXT = '직접 쓴 설명'

  /** 설명 한 칸만 보는 응답 -- 카테고리·옵션은 비워 둬 다른 칸이 끼어들지 않게 한다. */
  const draftOnly = (
    description: string | null,
    status?: string,
  ): Pick<ProductDraftAutofillResult, 'draft' | 'fieldStatus'> => ({
    draft: { categoryId: null, description, optionGroups: [], optionCombinations: [] },
    fieldStatus: status === undefined ? {} : { description: status },
  })

  it('[AC-SPRD-116] FILL은 셀러가 쓴 설명을 덮지 않고 빈 칸만 채운다', () => {
    const form = { ...emptyProductForm(), description: SELLER_TEXT }

    // 모드를 생략하면 FILL이다(기본값까지 같이 고정한다).
    const written = applyAutofillDraft(form, draftOnly('AI가 쓴 설명', 'FILLED'), [])
    expect(written.values.description).toBe(SELLER_TEXT)
    expect(written.filled).toEqual([])
    expect(applyAutofillDraft(form, draftOnly('AI가 쓴 설명', 'FILLED'), [], 'FILL').filled).toEqual([])

    // 빈 칸에는 얹는다.
    const blank = applyAutofillDraft({ ...emptyProductForm(), description: '  ' }, draftOnly('AI가 쓴 설명'), [])
    expect(blank.values.description).toBe('AI가 쓴 설명')
    expect(blank.filled).toEqual(['description'])
  })

  it('[AC-SPRD-117] REFINE이 다시 쓰지 못한 응답은 채운 것으로 세지 않는다', () => {
    const form = { ...emptyProductForm(), description: SELLER_TEXT }
    const refine = (result: Pick<ProductDraftAutofillResult, 'draft' | 'fieldStatus'>) =>
      applyAutofillDraft(form, result, [], 'REFINE')

    // AI는 다시 쓸 수 없으면 받은 원문을 그대로 담아 KEPT_LOCKED로 돌려준다.
    const kept = refine(draftOnly(SELLER_TEXT, 'KEPT_LOCKED'))
    expect(kept.values.description).toBe(SELLER_TEXT)
    expect(kept.filled).toEqual([])

    // fieldStatus를 FILLED로 적고 같은 글을 보내는 응답도, fieldStatus가 없는 배포도 같이 막는다.
    expect(refine(draftOnly(` ${SELLER_TEXT} `, 'FILLED')).filled).toEqual([])
    expect(refine(draftOnly(SELLER_TEXT)).filled).toEqual([])

    // 정말 다시 쓴 응답만 덮는다.
    const rewrote = refine(draftOnly('다시 쓴 설명', 'FILLED'))
    expect(rewrote.values.description).toBe('다시 쓴 설명')
    expect(rewrote.filled).toEqual(['description'])
  })
})
