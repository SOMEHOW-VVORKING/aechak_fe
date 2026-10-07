import { useQuery } from '@tanstack/react-query'
import { getHome } from '@aechak/api'
import {
  currentSessionEpoch,
  hydrateLikedFromSummaries,
  toCatalogProduct,
  type CatalogProduct,
} from '@/shared/catalog'

// GET /home(BE SCRUM-155 HomeController). recommended는 판매중 최대 8개 무작위, ranking은
// 인기순 상위 최대 5개(품절 포함). 펫 개인화는 없다.
export interface HomeFeed {
  recommended: CatalogProduct[]
  ranking: CatalogProduct[]
}

async function fetchHomeFeed(signal: AbortSignal | undefined): Promise<HomeFeed> {
  // 마켓/검색과 같은 이유로 요청 전에 세션 epoch를 캡처한다(로그아웃을 가로지른 응답의 찜 미러 오염 방지).
  const epoch = currentSessionEpoch()
  const res = await getHome(signal)
  hydrateLikedFromSummaries([...res.data.recommended, ...res.data.ranking], epoch)
  return {
    recommended: res.data.recommended.map(toCatalogProduct),
    ranking: res.data.ranking.map(toCatalogProduct),
  }
}

// /home은 서버에서 인증 필요(비로그인 401)다. 비회원/세션 없음은 홈 라우트 beforeLoad가 요청 전에
// 로그인으로 보내므로 여기서는 따로 가드하지 않는다.
export const useHomeFeed = () =>
  useQuery({
    queryKey: ['home', 'feed'],
    queryFn: ({ signal }) => fetchHomeFeed(signal),
  })
