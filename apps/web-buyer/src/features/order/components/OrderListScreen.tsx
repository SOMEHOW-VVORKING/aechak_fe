import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Package } from 'lucide-react'
import {
  Button,
  EmptyState,
  MobileScreen,
  SegmentedControl,
  Skeleton,
} from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { orderErrorMessage, type OrderSegment } from '@/shared/order'
import { useOrderList } from '../order.queries'
import { ORDER_SEGMENTS } from '../order.mock'
import { OrderCard } from './OrderCard'

// 주문 목록(b4-st-1). 세그먼트(전체/진행중/완료/취소)는 서버 status 필터로 나가고, 커서 더보기로 이어 붙인다.
// 조회 실패는 빈 상태로 위장하지 않고 안내 + 다시 시도를 보여준다.
export function OrderListScreen() {
  const navigate = useNavigate()
  const [segment, setSegment] = useState<OrderSegment>('all')
  const list = useOrderList(segment)

  const goBack = useSafeBack({ to: '/' })

  const openSellerOrder = (orderId: string) =>
    navigate({ to: '/orders/$orderId', params: { orderId } })

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="주문 내역" />}>
      <div className="flex min-h-full flex-col gap-3 p-4">
        <SegmentedControl
          options={ORDER_SEGMENTS.map(s => ({ value: s.value, label: s.label }))}
          value={segment}
          onChange={value => setSegment(value as OrderSegment)}
        />

        {list.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rect" className="h-40 w-full" />
            ))}
          </div>
        ) : list.isError ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <EmptyState
              title="주문 내역을 불러오지 못했어요"
              description={orderErrorMessage(list.error)}
              action={{ label: '다시 시도', onClick: list.refetch }}
            />
          </div>
        ) : list.groups.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <EmptyState
              icon={<Package className="size-8" />}
              title="아직 주문 내역이 없어요"
              description="마음에 드는 상품을 담아 첫 주문을 시작해 보세요."
              action={{ label: '쇼핑하러 가기', onClick: () => navigate({ to: '/market' }) }}
            />
          </div>
        ) : (
          <>
            {list.totalCount != null && (
              <p className="text-caption text-text-tertiary">총 {list.totalCount}건</p>
            )}
            {list.groups.map(order => (
              <OrderCard key={order.id} order={order} onOpenSellerOrder={openSellerOrder} />
            ))}
            {list.hasNextPage && (
              <div className="pt-2">
                <Button
                  variant="secondary"
                  fullWidth
                  loading={list.isFetchingNextPage}
                  onClick={list.fetchNextPage}
                >
                  더보기
                </Button>
                {list.isFetchNextPageError && (
                  <p className="mt-2 text-center text-caption text-error-fg">
                    더 불러오지 못했어요. 다시 눌러 주세요.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </MobileScreen>
  )
}
