// 배송지 주소록 스토어 배럴. 주소록 화면과 주문서가 여기서 읽고 쓴다.
export {
  MAX_ADDRESSES,
  addAddress,
  updateAddress,
  removeAddress,
  setDefaultAddress,
  resetAddresses,
  useAddresses,
  useDefaultAddress,
} from './address.store'
export type { AddressInput } from './address.store'
