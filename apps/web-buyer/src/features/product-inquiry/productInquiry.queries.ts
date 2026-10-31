import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import {
  askProductInquiry,
  errorResponse,
  getMyProductInquiries,
  getProductInquiries,
  withdrawProductInquiry,
  type AskProductInquiryRequest,
  type MyProductInquiryItem,
  type ProductInquiryItem,
} from '@aechak/api'

/**
 * 상품 상세 문의 영역이 한 번에 받는 건수. 상세는 긴 목록을 세로로 다 펼치는 자리가 아니라
 * '더보기'로 이어 받는다 — 리뷰 미리보기(3건)보다 조금 넉넉하게 둔다.
 */
export const PRODUCT_INQUIRY_PAGE_SIZE = 5

/** 내 문의 목록 한 페이지. 마이페이지 전용 화면이라 리뷰 목록과 같은 20건을 쓴다. */
const MY_PAGE_SIZE = 20

/** 상품별 문의 목록 캐시 접두. 등록·철회가 이 접두로 무효화한다. */
const productKey = (productId: string) => ['product-inquiries', 'product', productId] as const

/** 내 문의 목록 캐시 키. */
const MY_KEY = ['product-inquiries', 'mine'] as const

interface InquiryPage<T> {
  items: T[]
  totalCount: number
  hasNext: boolean
  /** 미존재·비노출 상품(404). 상품 상세 목록에서만 생긴다. */
  notFound: boolean
}

function isNotFound(e: unknown): boolean {
  return errorResponse(e)?.status === 404
}

const NOT_FOUND_PAGE: InquiryPage<ProductInquiryItem> = {
  items: [],
  totalCount: 0,
  hasNext: false,
  notFound: true,
}

export interface ProductInquiriesView {
  items: ProductInquiryItem[]
  /** 가려진 비밀글도 세는 전체 건수 — 서버가 행을 지우지 않으므로 목록 길이와 맞는다. */
  totalCount: number
  isLoading: boolean
  isError: boolean
  /** 상품이 미존재·비노출이다. 목록을 "문의 없음"으로 위장하지 않으려고 따로 구분한다. */
  notFound: boolean
  refetch: () => void
  hasNextPage: boolean
  fetchNextPage: () => void
  isFetchingNextPage: boolean
}

/**
 * 상품 상세의 문의 목록(GET /products/{id}/inquiries, 오프셋 페이지네이션).
 *
 * **목록도 JWT 필수다**(BE 컨트롤러의 AuthPrincipal이 non-null). 비밀글을 가릴지가 조회자에
 * 달려 있어서 서버가 permitAll로 열지 않았다. 그래서 호출부가 로그인 여부를 `enabled`로 넘겨
 * 비회원은 아예 부르지 않는다 — 401이 나면 전역 인터셉터가 로그인으로 보내 상세를 잃는다
 * (리뷰 미리보기와 같은 계약).
 */
export function useProductInquiries(
  productId: string,
  options: { enabled: boolean },
): ProductInquiriesView {
  const query = useInfiniteQuery({
    queryKey: productKey(productId),
    enabled: options.enabled && productId !== '',
    initialPageParam: 0,
    getNextPageParam: (last: InquiryPage<ProductInquiryItem>, pages) =>
      last.hasNext ? pages.length : undefined,
    queryFn: async ({ pageParam, signal }): Promise<InquiryPage<ProductInquiryItem>> => {
      try {
        const res = await getProductInquiries(
          productId,
          { page: pageParam, size: PRODUCT_INQUIRY_PAGE_SIZE },
          signal,
        )
        const d = res.data
        return { items: d.inquiries, totalCount: d.totalCount, hasNext: d.hasNext, notFound: false }
      } catch (e) {
        // 첫 페이지의 404만 not-found로 접는다(상세 본문은 이미 그려져 있다). 다른 오류는 그대로
        // 던져 영역이 조용히 비지 않게 한다.
        if (isNotFound(e) && pageParam === 0) return NOT_FOUND_PAGE
        throw e
      }
    },
  })

  const pages = query.data?.pages
  const first = pages?.[0]
  return {
    items: pages ? pages.flatMap(p => p.items) : [],
    totalCount: first?.totalCount ?? 0,
    isLoading: query.isPending && options.enabled,
    isError: query.isError,
    notFound: first?.notFound === true,
    refetch: () => void query.refetch(),
    hasNextPage: query.hasNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
    isFetchingNextPage: query.isFetchingNextPage,
  }
}

export interface MyProductInquiriesView {
  items: MyProductInquiryItem[]
  totalCount: number
  isLoading: boolean
  isError: boolean
  refetch: () => void
  hasNextPage: boolean
  fetchNextPage: () => void
  isFetchingNextPage: boolean
}

/**
 * 내가 등록한 문의 목록(GET /users/me/product-inquiries). status를 보내지 않아 철회한 문의까지
 * 전부 받는다 — 철회가 조용히 사라지면 "내가 철회했다"를 확인할 자리가 없어진다.
 */
export function useMyProductInquiries(): MyProductInquiriesView {
  const query = useInfiniteQuery({
    queryKey: MY_KEY,
    initialPageParam: 0,
    getNextPageParam: (last: InquiryPage<MyProductInquiryItem>, pages) =>
      last.hasNext ? pages.length : undefined,
    queryFn: async ({ pageParam, signal }): Promise<InquiryPage<MyProductInquiryItem>> => {
      const res = await getMyProductInquiries({ page: pageParam, size: MY_PAGE_SIZE }, signal)
      const d = res.data
      return { items: d.inquiries, totalCount: d.totalCount, hasNext: d.hasNext, notFound: false }
    },
  })

  const pages = query.data?.pages
  return {
    items: pages ? pages.flatMap(p => p.items) : [],
    totalCount: pages?.[0]?.totalCount ?? 0,
    isLoading: query.isPending,
    isError: query.isError,
    refetch: () => void query.refetch(),
    hasNextPage: query.hasNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
    isFetchingNextPage: query.isFetchingNextPage,
  }
}

/** 문의가 늘거나 줄면 그 상품 목록과 내 문의 목록이 함께 낡는다. */
function invalidateInquiries(queryClient: QueryClient, productId: string): void {
  void queryClient.invalidateQueries({ queryKey: productKey(productId) })
  void queryClient.invalidateQueries({ queryKey: MY_KEY })
}

export interface AskProductInquiryInput {
  productId: string
  body: AskProductInquiryRequest
}

/** 문의 등록(POST /products/{id}/inquiries). */
export function useAskProductInquiry() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, AskProductInquiryInput>({
    mutationFn: async ({ productId, body }) => {
      await askProductInquiry(productId, body)
    },
    onSuccess: (_, { productId }) => {
      invalidateInquiries(queryClient, productId)
      // 등록 화면에서 상세로 돌아가면 상세 목록 쿼리는 아직 비활성이라 무효화만으로는 마운트
      // 직후 이전 목록(방금 쓴 문의가 없는 상태)이 재조회 전까지 보인다. 캐시를 비워 로딩을
      // 거치게 한다.
      void queryClient.resetQueries({ queryKey: productKey(productId) })
    },
  })
}

export interface WithdrawProductInquiryInput {
  inquiryId: string
  /** 무효화할 상품 목록 캐시 키를 고르려고 함께 받는다. */
  productId: string
}

/**
 * 문의 철회(DELETE /product-inquiries/{inquiryId}). **되돌릴 수 없다** — 호출부가 확인 한 단계를
 * 거친 뒤에만 부른다. 404(이미 지워짐)도 성공으로 접지 않는다: 철회는 상태가 갈리는 조치라
 * (답변 달림 409, 이미 철회 409) 사용자가 사유를 읽어야 한다.
 */
export function useWithdrawProductInquiry() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, WithdrawProductInquiryInput>({
    mutationFn: async ({ inquiryId }) => {
      await withdrawProductInquiry(inquiryId)
    },
    onSuccess: (_, { productId }) => invalidateInquiries(queryClient, productId),
  })
}

/**
 * 문의 등록·철회 실패 안내. 401은 axios 인터셉터의 refresh + 전역 리다이렉트가 처리하므로 여기
 * 오지 않는다. 같은 status에 사유가 여러 개라 errorCode로 분기한다(서버 message는 -습니다체라
 * 그대로 쓰지 않는다).
 */
export function productInquiryErrorMessage(error: unknown): string {
  switch (errorResponse(error)?.data?.errorCode) {
    case 120101:
      return '문의 제목을 입력해주세요.'
    case 120102:
      return '문의 제목은 100자까지 쓸 수 있어요.'
    case 120103:
      return '문의 내용을 입력해주세요.'
    case 120104:
      return '문의 내용은 1000자까지 쓸 수 있어요.'
    case 120113:
      return '내가 등록한 상품에는 문의를 남길 수 없어요.'
    case 120107:
      return '본인이 등록한 문의만 철회할 수 있어요.'
    case 120100:
      return '문의를 찾지 못했어요. 목록을 다시 불러와 주세요.'
    case 120110:
      return '이미 철회한 문의예요.'
    case 120111:
      return '답변이 달린 문의는 철회할 수 없어요.'
    default:
      return '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.'
  }
}
