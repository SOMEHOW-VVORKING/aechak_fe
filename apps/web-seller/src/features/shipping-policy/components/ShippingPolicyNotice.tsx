import { Card } from '@aechak/design-system/web'

// 상품 등록/수정 폼의 배송 정책 칸. 배송 정책은 셀러 단위(CRQ-SLR-04)라 상품 본문에 싣지 않는데,
// seller 모듈에 정책 조회 API가 없어 요약 대신 준비 중 안내만 둔다(목업 수치를 실 화면에 싣지 않는다).
export function ShippingPolicyNotice() {
  return (
    <Card padding="md">
      <p className="text-body-sm font-medium text-text-primary">배송 정책 설정은 준비 중이에요</p>
      <p className="mt-1 text-caption text-text-tertiary">
        배송 정책은 스토어 전체 상품에 함께 적용돼요. 조회·수정은 서버가 준비되면 열어 둘게요.
      </p>
    </Card>
  )
}
