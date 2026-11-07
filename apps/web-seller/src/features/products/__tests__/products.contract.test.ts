import { describe, it, expect } from 'vitest'
import {
  buildCombinations,
  discountRate,
  emptyProductForm,
  productErrorMessage,
  toDraftRequest,
  toFormValues,
  toRegisterRequest,
  toUpdateRequest,
  validateProductForm,
  type ProductDraft,
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
