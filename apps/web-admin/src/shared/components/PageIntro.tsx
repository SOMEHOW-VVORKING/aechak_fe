import { PageHeader } from '@aechak/design-system/web'

/** 어드민 목록 화면 상단 — DS PageHeader에는 설명 슬롯이 없어 제목 아래 한 줄 설명을 여기서 붙인다. */
export function PageIntro({ title, description }: { title: string; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <p className="-mt-4 mb-5 text-body-sm text-text-tertiary">{description}</p>
    </>
  )
}
