import { useNavigate, useRouter } from '@tanstack/react-router'
import { DocumentHeader, MobileScreen } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { PRIVACY_REVISION, PRIVACY_SECTIONS } from '../settings.mock'
import { DocParagraph, DocSection } from './DocLayout'

// 개인정보 처리방침(b11-st-4). 정적 문서 뷰 — 문서 헤더 + 본문 4개 섹션.
export function PrivacyPolicyScreen() {
  const navigate = useNavigate()
  const router = useRouter()

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/settings' })
  }

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="개인정보 처리방침" />} contentClassName="pb-8">
      <DocumentHeader title="개인정보 처리방침" revision={PRIVACY_REVISION} />
      <div className="flex flex-col gap-6 p-4">
        {PRIVACY_SECTIONS.map(section => (
          <DocSection key={section.title} title={section.title}>
            <DocParagraph>{section.body}</DocParagraph>
          </DocSection>
        ))}
      </div>
    </MobileScreen>
  )
}
