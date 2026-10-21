// 반려동물 프로필 배럴. feature 간 직접 import가 금지이므로 여러 화면이 공유하는 펫 데이터는
// 여기서 읽는다. 대표 유일성·자동 승격·목록 정렬은 서버가 소유하고 이 계층은 조회·변환만 한다.
export {
  PET_NAME_MAX_LENGTH,
  PET_NAME_REQUIRED_MESSAGE,
  PET_WEIGHT_MAX_KG,
  PET_WEIGHT_MIN_KG,
  PET_WEIGHT_RANGE_MESSAGE,
  PET_WEIGHT_STEP_KG,
  PET_WEIGHT_STEP_MESSAGE,
  petErrorMessage,
  usePetList,
  useRegisterPet,
  useRemovePet,
  useSetDefaultPet,
  useUpdatePet,
} from './pet.queries'
export type { PetInput } from './pet.queries'
export {
  isWithinPhotoSizeLimit,
  petPhotoUploadErrorMessage,
  uploadPetPhoto,
  MAX_PHOTO_BYTES,
  OVERSIZED_PHOTO_MESSAGE,
} from './pet.upload'
export { CURRENT_YEAR, petAge } from './pet-age'
