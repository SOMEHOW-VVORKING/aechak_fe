import { useQuery } from '@tanstack/react-query'
import { fetchProductDetail, type ProductDetail } from './product.mock'

export const useProductDetail = (id: string) =>
  useQuery<ProductDetail | null>({
    queryKey: ['product', 'detail', id],
    queryFn: () => fetchProductDetail(id),
    enabled: id !== '',
  })
