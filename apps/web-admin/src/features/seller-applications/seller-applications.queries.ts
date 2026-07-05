import { useQuery } from '@tanstack/react-query'
import type { SellerApplication } from '@aechak/domain'
import { sellerApplicationsMock } from './seller-applications.mock'

export const useSellerApplications = () =>
  useQuery<SellerApplication[]>({
    queryKey: ['sellers', 'applications'],
    queryFn: () => Promise.resolve(sellerApplicationsMock),
  })
