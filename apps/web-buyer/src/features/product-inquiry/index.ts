// 구매자 상품 문의(SCRUM-340) public API. 고객센터 1:1 문의(features/inquiry)와 도메인이 다르다 —
// 저쪽은 구매자가 운영자에게 묻는 `POST /inquiries`이고, 이쪽은 구매자가 셀러에게 묻는
// `/products/{id}/inquiries`다.
//
// 라우트가 소비하는 화면 셋만 공개한다. 쿼리 훅·라벨은 feature 안에서만 쓰므로 내보내지 않는다
// (feature 간 import가 금지라 밖에서 쓸 곳도 없다).
export { MyProductInquiriesScreen } from './components/MyProductInquiriesScreen'
export { ProductInquirySection } from './components/ProductInquirySection'
export { ProductInquiryWriteScreen } from './components/ProductInquiryWriteScreen'
