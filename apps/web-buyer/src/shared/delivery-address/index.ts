// 배송지 배럴 — 어댑터(delivery-address.queries.ts)와 표시 포맷 재수출.
export { formatPhone, toPhoneDigits } from './delivery-address.format'
export {
  MAX_DELIVERY_ADDRESSES,
  deliveryAddressErrorMessage,
  useDeliveryAddresses,
  useDefaultDeliveryAddress,
  useAddDeliveryAddress,
  useUpdateDeliveryAddress,
  useRemoveDeliveryAddress,
  useSetDefaultDeliveryAddress,
} from './delivery-address.queries'
export type { DeliveryAddressInput } from './delivery-address.queries'
