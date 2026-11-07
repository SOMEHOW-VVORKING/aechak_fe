import { useNavigate } from '@tanstack/react-router'
import { Lock, MessageSquarePlus } from 'lucide-react'
import { Button, Card, Skeleton, StatusPill } from '@aechak/design-system/web'
import type { ProductInquiryItem } from '@aechak/api'
import { Divider } from '@/shared/components/Divider'
import { LoginGate, useIsLoggedIn, useLoginGate } from '@/shared/auth'
import { findMockProduct } from '@/shared/catalog'
import {
  INQUIRY_CATEGORY_LABEL,
  INQUIRY_STATUS_LABEL,
  INQUIRY_STATUS_VARIANT,
  inquiryDate,
} from '../productInquiry.labels'
import { useProductInquiries } from '../productInquiry.queries'
import { LoadMoreInquiries } from './LoadMoreInquiries'

/**
 * 상품 상세의 상품 문의 영역(SCRUM-340). 상세 화면이 라우트에서 슬롯으로 받아 렌더한다 —
 * feature 간 직접 import가 금지라 상세 화면(features/product)이 이 컴포넌트를 부를 수 없다.
 *
 * **목업 카탈로그 상품(p-*)에는 아무것도 그리지 않는다.** 서버에 없는 상품이라 문의를 등록할
 * 곳도, 받을 목록도 없다 — 빈 목록과 죽은 '문의하기'를 그리는 것보다 영역 자체를 접는다.
 */
export function ProductInquirySection({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const isLoggedIn = useIsLoggedIn()
  const { gateOpen, gateFeature, requireAuth, closeGate } = useLoginGate()
  const isMockProduct = findMockProduct(productId) != null

  // 목록도 JWT 필수다(비밀글 가리기 판정에 조회자가 필요). 비회원은 호출하지 않는다 — 401이 나면
  // 전역 인터셉터가 로그인으로 보내 상세를 잃는다.
  const inquiries = useProductInquiries(productId, { enabled: isLoggedIn && !isMockProduct })

  if (isMockProduct) return null

  // 목록을 실제로 받은 상태에서만 건수를 쓴다.
  const showCount = isLoggedIn && !inquiries.notFound && !inquiries.isError && !inquiries.isLoading

  const goWrite = () =>
    requireAuth('inquiry', () =>
      navigate({ to: '/products/$productId/inquiries/new', params: { productId } }),
    )

  return (
    <>
      <Divider />
      <section className="flex flex-col gap-3" aria-labelledby="product-inquiry-heading">
        <div className="flex items-center justify-between">
          <span
            id="product-inquiry-heading"
            className="text-subheading font-semibold text-text-primary"
          >
            {/* 건수는 목록을 실제로 받았을 때만 붙인다 — 비회원·실패에 0을 적으면 "문의 없음"이 된다. */}
            상품 문의{showCount ? ` ${inquiries.totalCount}` : ''}
          </span>
          <Button variant="secondary" size="sm" onClick={goWrite}>
            <MessageSquarePlus className="mr-1 size-4" />
            문의하기
          </Button>
        </div>

        {!isLoggedIn ? (
          // 비회원에게 "문의가 없다"고 말하지 않는다 — 목록을 못 본 것과 없는 것은 다르다.
          <Card className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
            <p className="text-body-sm text-text-secondary">상품 문의는 로그인하면 볼 수 있어요</p>
            <p className="text-caption text-text-tertiary">
              비밀글을 가려서 보여주려면 누가 보는지 알아야 해요
            </p>
          </Card>
        ) : inquiries.isError ? (
          <Card className="flex flex-col items-center gap-2.5 px-4 py-6 text-center">
            <p className="text-body-sm text-text-secondary">문의를 불러오지 못했어요</p>
            <Button variant="secondary" size="sm" onClick={inquiries.refetch}>
              다시 시도
            </Button>
          </Card>
        ) : inquiries.notFound ? (
          // 서버가 상품을 노출하지 않는다(404). 문의 0건으로 위장하면 "질문이 없는 상품"으로 읽힌다 —
          // 재시도 버튼은 두지 않는다(상품이 돌아오는 건 사용자가 할 일이 아니다).
          <Card className="px-4 py-6 text-center text-body-sm text-text-secondary">
            지금은 이 상품의 문의를 볼 수 없어요
          </Card>
        ) : inquiries.isLoading ? (
          <div className="flex flex-col gap-3">
            {[0, 1].map(i => (
              <Skeleton key={i} variant="rect" className="h-20 w-full" />
            ))}
          </div>
        ) : inquiries.items.length === 0 ? (
          <Card className="flex flex-col items-center gap-1.5 px-4 py-6 text-center">
            <p className="text-body-sm text-text-secondary">아직 등록된 문의가 없어요</p>
            <p className="text-caption text-text-tertiary">문의를 남기면 판매자가 답변해요</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {inquiries.items.map(item => (
              <ProductInquiryCard key={item.inquiryId} item={item} />
            ))}
            {inquiries.hasNextPage && (
              <LoadMoreInquiries
                onClick={inquiries.fetchNextPage}
                loading={inquiries.isFetchingNextPage}
              />
            )}
          </div>
        )}
      </section>

      <LoginGate open={gateOpen} feature={gateFeature} onClose={closeGate} />
    </>
  )
}

/**
 * 문의 한 건.
 *
 * **`readable`이 false면 제목·본문·답변을 렌더하지 않는다.** 서버가 그 자리에 자리표시 문자열
 * ("비밀글입니다.")을 넣어 내려주는데, 그걸 본문처럼 그리면 사용자가 "작성자가 저 문장을 썼다"고
 * 읽는다. 행을 지우지도 않는다 — 서버 totalCount가 가려진 글까지 세므로 머리말 숫자와 카드 수가
 * 어긋난다.
 */
function ProductInquiryCard({ item }: { item: ProductInquiryItem }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-1.5">
        <StatusPill variant="neutral" size="sm">
          {INQUIRY_CATEGORY_LABEL[item.category]}
        </StatusPill>
        <StatusPill variant={INQUIRY_STATUS_VARIANT[item.status]} size="sm">
          {INQUIRY_STATUS_LABEL[item.status]}
        </StatusPill>
        {item.secret && (
          <span className="flex items-center gap-0.5 text-caption text-text-tertiary">
            <Lock className="size-3" aria-hidden="true" />
            비밀글
          </span>
        )}
        {item.mine && (
          <StatusPill variant="brand" size="sm">
            내 문의
          </StatusPill>
        )}
      </div>

      {item.readable ? (
        <>
          <p className="text-label font-semibold text-text-primary">{item.title}</p>
          <p className="whitespace-pre-wrap text-body-sm leading-relaxed text-text-secondary">
            {item.content}
          </p>
        </>
      ) : (
        <p className="text-body-sm text-text-tertiary">
          작성자와 판매자만 볼 수 있는 문의예요
        </p>
      )}

      <p className="text-caption text-text-tertiary">
        {item.authorMasked} / {inquiryDate(item.askedAt)}
      </p>

      {item.readable && item.answer && (
        <div className="mt-1 rounded-card bg-surface-sunken p-3">
          <p className="text-caption font-semibold text-text-secondary">판매자 답변</p>
          <p className="mt-1 whitespace-pre-wrap text-body-sm leading-relaxed text-text-primary">
            {item.answer.content}
          </p>
          <p className="mt-1.5 text-caption text-text-tertiary">
            {inquiryDate(item.answer.answeredAt)}
          </p>
        </div>
      )}
    </Card>
  )
}
