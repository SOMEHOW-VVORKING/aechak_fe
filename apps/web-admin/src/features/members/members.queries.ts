import { useQuery } from '@tanstack/react-query'
import type { MemberAccount } from '@aechak/domain'
import { memberAccountsMock } from './members.mock'

export const useMemberAccounts = () =>
  useQuery<MemberAccount[]>({
    queryKey: ['members'],
    queryFn: () => Promise.resolve(memberAccountsMock),
  })
