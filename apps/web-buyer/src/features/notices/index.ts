// 구매자 공지사항(SCRUM-332) public API. 라우트가 소비하는 화면 둘만 공개한다 — 쿼리 훅·라벨은
// feature 안에서만 쓰고, feature 간 직접 import가 금지라 밖에서 쓸 곳도 없다
// (product-inquiry/index.ts 관례).
export { NoticeListScreen } from './components/NoticeListScreen'
export { NoticeDetailScreen } from './components/NoticeDetailScreen'
