import { Select } from '@aechak/design-system/web'
import type { SelectProps } from '@aechak/design-system/web'

/**
 * FilterBar 안의 Select. DS Select는 안쪽 <select>가 w-full이라 폭을 바깥 래퍼가 정해야 하므로
 * 래퍼를 여기서 가진다(Select className은 안쪽 <select>에 붙어 폭 지정이 안 된다).
 */
export function FilterSelect({ narrow, ...props }: SelectProps & { narrow?: boolean }) {
  return (
    <div className={narrow ? 'w-36' : 'w-40'}>
      <Select {...props} />
    </div>
  )
}
