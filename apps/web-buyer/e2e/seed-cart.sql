-- 장바구니 API 로컬 검증용 최소 시드.
-- 전제: BE 첫 부팅으로 Flyway V1~V9(categories 시드 포함) + ddl-auto 테이블 생성이 끝난 상태.
-- 구매자 users.id=1 (JWT sub=1), 셀러 user_id=100, 상품 1건(public_id ULID) + 옵션 조합 2건.

INSERT INTO users (id, status, role, point_balance, is_phone_verified, warning_count, is_pii_purged, created_at, updated_at)
VALUES (1, 'ACTIVE', 'GENERAL', 0, 0, 0, 0, NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE status = 'ACTIVE';

INSERT INTO sellers (user_id, status, status_changed_at, store_name, base_shipping_fee, free_shipping_threshold, confirmed_order_count, telesales_notice_status, version, created_at, updated_at)
VALUES (100, 'ACTIVE', NOW(6), '냥이상점', 3000, 50000, 0, 'NOT_REQUIRED', 0, NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE status = 'ACTIVE';

-- category_id 111 = V2 시드(건식사료, 강아지>사료 하위). 할인 기간 null-null = 상시 할인(판매가 64,000).
INSERT INTO products (id, public_id, category_id, seller_id, name, description, regular_price, discount_price, sale_status, inspection_status, version, created_at, updated_at)
VALUES (1, '01JCART0000000000000000001', 111, 100, '고양이 자동 급식기 스마트 5L', '로컬 연동 검증용 상품', 89000, 64000, 'ON_SALE', 'APPROVED', 0, NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE sale_status = 'ON_SALE';

INSERT INTO option_combinations (id, product_id, name, additional_price, stock_quantity, is_active, value_signature, created_at, updated_at)
VALUES
  (1, 1, '기본형', 0, 10, 1, 'seed-basic', NOW(6), NOW(6)),
  (2, 1, '프리미엄형', 5000, 5, 1, 'seed-premium', NOW(6), NOW(6))
ON DUPLICATE KEY UPDATE is_active = 1;
