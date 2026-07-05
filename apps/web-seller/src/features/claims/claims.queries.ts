import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClaimResponsibleParty, ClaimStatus, ClaimType } from '@aechak/domain'
import {
  mockApproveClaim,
  mockConfirmRefund,
  mockFetchClaims,
  mockRejectClaim,
  mockUpdateClaimMemo,
} from './claims.mock'

export const CLAIMS_QUERY_KEY = ['claims'] as const

export const useClaims = () =>
  useQuery({
    queryKey: CLAIMS_QUERY_KEY,
    queryFn: mockFetchClaims,
  })

function useClaimsMutation(mutationFn: (id: string) => Promise<void>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAIMS_QUERY_KEY }),
  })
}

export const useApproveClaim = () => useClaimsMutation(mockApproveClaim)
export const useRejectClaim = () => useClaimsMutation(mockRejectClaim)
export const useConfirmRefund = () => useClaimsMutation(mockConfirmRefund)

export const useUpdateClaimMemo = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ claimId, memo }: { claimId: string; memo: string }) => mockUpdateClaimMemo(claimId, memo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CLAIMS_QUERY_KEY }),
  })
}

export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  cancel: '취소',
  return: '반품',
  exchange: '교환',
  dispute: '분쟁',
}

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  pending: '승인 대기',
  approved: '승인 완료',
  rejected: '거부됨',
  collecting: '수거중',
  refunded: '환불 완료',
}

export const RESPONSIBLE_PARTY_LABEL: Record<ClaimResponsibleParty, string> = {
  buyer: '구매자 귀책',
  seller: '셀러 귀책',
}
