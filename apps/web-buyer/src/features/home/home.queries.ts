import { useQuery } from '@tanstack/react-query'
import { fetchHomeFeed, type HomeFeed } from './home.mock'

// 펫 등록 상태(1-A/1-B) 분기 확인용 파라미터. 프로덕션 라우트는 인자 없이 호출(1-A 기본).
// 미등록(1-B) 화면을 확인하려면 개발 중 일시적으로 false를 넘겨 렌더링한다.
export const useHomeFeed = (petRegistered = true) =>
  useQuery<HomeFeed>({
    queryKey: ['home', 'feed', petRegistered],
    queryFn: () => fetchHomeFeed(petRegistered),
  })
