/**
 * ⚠️ 임시 프리뷰 라우트 (TEMPORARY PREVIEW — Phase 0 리뷰용)
 *
 * web 디자인 시스템 신규 컴포넌트 5종(ProductCard/Timeline/RatingInput/ReviewCard/BottomSheet)을
 * mock 데이터로 여러 상태(기본/세일/품절/readonly 등)로 렌더링해 localhost:5175/preview 에서
 * 한눈에 확인하기 위한 화면. 실제 구매자 화면이 아니며, 리뷰가 끝나면 이 파일을 통째로 삭제해도 된다
 * (라우트 트리에서만 빠지고 다른 코드에 영향 없음). 삭제 후 `routeTree.gen.ts` 재생성 필요.
 */
import { type ReactNode, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  BottomSheet,
  Button,
  MobileScreen,
  ProductCard,
  RatingInput,
  ReviewCard,
  Timeline,
  type TimelineStep,
} from '@aechak/design-system/web'

export const Route = createFileRoute('/preview')({
  component: PreviewScreen,
})

// mock 썸네일: 네트워크 의존 없이 인라인 SVG data-URI 회색 사각형.
function mockImg(fill: string): string {
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="${fill}"/></svg>`,
    )
  )
}
const IMG = mockImg('#E9E5DF')
const IMG2 = mockImg('#DAD5CC')

const timelineSteps: TimelineStep[] = [
  { label: '결제완료', sublabel: '6/13', status: 'done' },
  { label: '상품준비중', sublabel: '6/13', status: 'done' },
  { label: '배송중', sublabel: '6/14 / CJ대한통운 1234-5678-9012', status: 'active' },
  { label: '배송완료', sublabel: '5일 후 자동 확정', status: 'todo' },
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border-subtle pt-4">
      <h2 className="mb-3 text-subheading font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  )
}

function PreviewScreen() {
  const [wished, setWished] = useState(false)
  const [rating, setRating] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    // MobileScreen으로 감싸 실제 탭 화면과 동일하게 프레임 높이를 뷰포트로 고정한다 —
    // __root의 transform containing block과 결합돼 BottomSheet가 프레임 하단에 정확히 고정됨.
    <MobileScreen>
      <div className="flex flex-col gap-6 p-4">
      <h1 className="text-title font-semibold text-text-primary">컴포넌트 프리뷰 (임시)</h1>

      <Section title="ProductCard">
        <div className="grid grid-cols-2 gap-3">
          <ProductCard
            image={IMG}
            storeName="냥이상점"
            name="고양이 자동 급식기 5L"
            price={78000}
            onClick={() => {}}
          />
          <ProductCard
            image={IMG}
            storeName="스마트펫"
            name="고양이 자동 급식기 스마트 5L 세일 상품"
            price={64000}
            originalPrice={89000}
            onClick={() => {}}
          />
          <ProductCard
            image={IMG}
            storeName="멍멍마트"
            name="스크래쳐 하우스 2종 세트"
            price={29000}
            isSold
            wished
            onWishToggle={() => {}}
          />
          <ProductCard
            image={IMG}
            storeName="코코펫"
            name="관절 영양제 코코넛맛 90정"
            price={32000}
            wished={wished}
            onWishToggle={() => setWished(v => !v)}
            onClick={() => {}}
          />
        </div>
      </Section>

      <Section title="Timeline">
        <Timeline steps={timelineSteps} />
      </Section>

      <Section title="RatingInput">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="w-24 text-caption text-text-tertiary">readonly 4.8</span>
            <RatingInput value={4.8} readonly size={20} />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 text-caption text-text-tertiary">readonly 3</span>
            <RatingInput value={3} readonly size={20} />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 text-caption text-text-tertiary">입력({rating}점)</span>
            <RatingInput value={rating} onChange={setRating} />
          </div>
        </div>
      </Section>

      <Section title="ReviewCard">
        <div className="flex flex-col gap-3">
          <ReviewCard
            author="집사**"
            rating={5}
            date="06.11"
            content="먼지가 거의 안 날리고 굳음도 단단해요. 재구매 의사 있습니다. 배송도 하루 만에 왔어요."
            verifiedPurchase
            images={[IMG, IMG2]}
          />
          <ReviewCard
            author="냥집사7"
            rating={4}
            date="06.10"
            content="가성비 좋아요. 다만 배송이 조금 늦었어요."
          />
        </div>
      </Section>

      <Section title="BottomSheet">
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>
          하단 시트 열기
        </Button>
        <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="정렬 기준">
          <div className="flex flex-col gap-2">
            {['추천순', '최신순', '낮은 가격순', '높은 가격순'].map(opt => (
              <Button key={opt} variant="ghost" onClick={() => setSheetOpen(false)}>
                {opt}
              </Button>
            ))}
          </div>
        </BottomSheet>
      </Section>
      </div>
    </MobileScreen>
  )
}
