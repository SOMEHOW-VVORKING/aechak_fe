// 배송지 배럴 — 어댑터(delivery-address.queries.ts)와 표시 포맷 재수출.
export { CONTACT_NUMBER_PATTERN, formatPhone, toPhoneDigits } from './delivery-address.format'
export {
  DELIVERY_ADDRESS_LABEL_MAX_LENGTH,
  DELIVERY_MEMO_MAX_LENGTH,
  DETAIL_ADDRESS_MAX_LENGTH,
  MAX_DELIVERY_ADDRESSES,
  RECEIVER_NAME_MAX_LENGTH,
  deliveryAddressErrorMessage,
  useDeliveryAddresses,
  useDefaultDeliveryAddress,
  useAddDeliveryAddress,
  useUpdateDeliveryAddress,
  useRemoveDeliveryAddress,
  useSetDefaultDeliveryAddress,
} from './delivery-address.queries'
export type { DeliveryAddressInput } from './delivery-address.queries'
