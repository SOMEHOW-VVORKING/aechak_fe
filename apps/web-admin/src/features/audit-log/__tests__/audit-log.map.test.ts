import { describe, expect, it } from 'vitest'
import { AUDIT_ACTION_LABELS } from '../audit-log.map'

// be AdminAuditAction의 라벨(2026-11-07 develop). 행은 서버 actionLabel을 그리고 필터 옵션은
// 이 표를 그리므로, 글자가 갈리면 운영자가 행에서 본 이름으로 필터를 찾지 못한다.
const SERVER_ACTION_LABELS = {
  SELLER_APPLICATION_APPROVED: '셀러 입점 승인',
  SELLER_APPLICATION_REJECTED: '셀러 입점 거부',
  SELLER_SUSPENDED: '셀러 판매정지',
  SELLER_SUSPENSION_RELEASED: '셀러 판매정지 해제',
  SELLER_MEMO_UPDATED: '셀러 내부 메모 수정',
  ADMIN_PROMOTED: '관리자 권한 부여',
  ADMIN_DEMOTED: '관리자 권한 회수',
  PRODUCT_INSPECTION_APPROVED: '상품 검수 승인',
  PRODUCT_INSPECTION_REJECTED: '상품 검수 반려',
  PRODUCT_SALE_SUSPENDED: '상품 판매중지',
  PRODUCT_SALE_RESUMED: '상품 판매 재개',
  CLAIM_INTERVENED: '클레임 개입',
  MEMBER_SANCTIONED: '회원 제재',
  MEMBER_SANCTION_RELEASED: '회원 제재 해제',
  MEMBER_PROFILE_RESET: '회원 프로필 초기화',
  INQUIRY_ANSWERED: '서비스 문의 답변',
  REVIEW_BLINDED: '리뷰 블라인드',
  REVIEW_UNBLINDED: '리뷰 블라인드 해제',
  REVIEW_DELETED: '리뷰 삭제',
  ORDER_DISPATCH_NUDGED: '셀러 발송 독촉',
  NOTICE_UPDATED: '서비스 공지 수정',
  NOTICE_PUBLISHED: '서비스 공지 게시',
  NOTICE_UNPUBLISHED: '서비스 공지 내림',
  REPORT_DECIDED: '신고 처리',
}

describe('액션 필터 라벨', () => {
  it('[AC-ADM-AUD-020] 필터 옵션 글자가 서버 actionLabel과 같다', () => {
    expect(AUDIT_ACTION_LABELS).toEqual(SERVER_ACTION_LABELS)
  })
})
