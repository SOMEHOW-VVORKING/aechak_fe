import { useQuery } from '@tanstack/react-query'
import type { SellerAccount } from '@aechak/domain'
import { sellerAccountsMock } from './sellers.mock'

export const useSellerAccounts = () =>
  useQuery<SellerAccount[]>({
    queryKey: ['sellers', 'accounts'],
    queryFn: () => Promise.resolve(sellerAccountsMock),
  })
