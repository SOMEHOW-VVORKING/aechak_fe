import { useQuery } from '@tanstack/react-query'
import type { AiReviewQueueItem } from '@aechak/domain'
import { aiReviewQueueItemsMock } from './ai-review-queue.mock'

export const useAiReviewQueueItems = () =>
  useQuery<AiReviewQueueItem[]>({
    queryKey: ['products', 'ai-review-queue'],
    queryFn: () => Promise.resolve(aiReviewQueueItemsMock),
  })
