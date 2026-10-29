import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { answerSellerInquiry, getSellerInquiries } from '@aechak/api'
import type { SellerInquiryListData, SellerInquirySearchInput } from './inquiries.contract'
import { normalizeInquirySearchParams } from './inquiries.contract'

// 생성된 react-query 훅은 쓰지 않고 fetcher만 소비하고(claims·products 관례) 이 파일이 자체
// useQuery/useMutation으로 감싼다. fetcher는 `{ data }` 한 겹(ApiResponse)을 돌려주므로 여기서
// 벗긴다. 호스트는 공유 클라이언트가 경로 접두로 가른다 — `/sellers/**`는 seller 모듈(8081)이다.

export const INQUIRIES_QUERY_KEY = ['inquiries'] as const

export const useSellerInquiries = (input: SellerInquirySearchInput) => {
  // 정규화한 값으로 키를 만든다 — `{ status: '' }`와 `{}`가 같은 요청이므로 캐시도 같아야 한다.
  const params = normalizeInquirySearchParams(input)
  // 제네릭을 명시한다 — `placeholderData: keepPreviousData`와 `queryFn`의 구조 분해가 겹치면
  // 추론이 TData에 keepPreviousData의 함수 타입까지 섞어 넣는다(claims·products와 같은 함정).
  return useQuery<SellerInquiryListData>({
    queryKey: [...INQUIRIES_QUERY_KEY, 'list', params],
    queryFn: ({ signal }) => getSellerInquiries(params, signal).then(response => response.data),
    // 탭·필터·페이지를 바꾸는 동안 표가 비지 않게 이전 결과를 유지한다.
    placeholderData: keepPreviousData,
  })
}

/**
 * 답변 등록. 문의당 한 번만 받으므로 수정 경로가 없다.
 *
 * **실패도 무효화한다**(onSuccess가 아니라 onSettled인 이유). 실패의 상당수가 "화면이 든 행이
 * 낡았다"는 뜻이다 — 409/120109(이미 답변함), 409/120114(구매자 철회), 404/120100(사라짐)은 모두
 * 서버 쪽 상태가 이미 움직인 경우다. 성공만 무효화하면 그 행이 낡은 상태로 남아 같은 버튼이 다시
 * 눌리고 같은 실패를 반복한다.
 */
export const useAnswerInquiry = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ inquiryId, content }: { inquiryId: string; content: string }) =>
      answerSellerInquiry(inquiryId, { content }).then(response => response.data),
    onSettled: () => queryClient.invalidateQueries({ queryKey: INQUIRIES_QUERY_KEY }),
  })
}
