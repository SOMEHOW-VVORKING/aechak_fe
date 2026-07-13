import { useQuery } from '@tanstack/react-query'
import { fetchCatalog, type CatalogParams, type CatalogResult } from './catalog.mock'

export const useCatalog = (params: CatalogParams) =>
  useQuery<CatalogResult>({
    queryKey: ['catalog', params.mainCategory, params.subCategory, params.sort, params.excludeSoldOut],
    queryFn: () => fetchCatalog(params),
  })
