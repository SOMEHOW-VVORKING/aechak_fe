import { useQuery } from '@tanstack/react-query'
import type { ProductReviewItem } from '@aechak/domain'
import { productReviewItemsMock } from './product-review.mock'

export const useProductReviewItems = () =>
  useQuery<ProductReviewItem[]>({
    queryKey: ['products', 'review'],
    queryFn: () => Promise.resolve(productReviewItemsMock),
  })
