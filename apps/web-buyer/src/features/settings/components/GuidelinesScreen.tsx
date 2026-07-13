import { useNavigate, useRouter } from '@tanstack/react-router'
import { Check, X } from 'lucide-react'
import { Alert, DocumentHeader, MobileScreen } from '@aechak/design-system/web'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { GUIDELINE_BAD, GUIDELINE_GOOD, GUIDELINE_REVISION } from '../settings.mock'
import { DocSection } from './DocLayout'

// 커뮤니티 가이드라인(b11-st-6). 정적 문서 뷰 — 권장/제한 행동 + 위반 시 제재 단계 안내.
// 목업의 하단 "신고하기"는 SNS 게시물 신고(범위 밖)로 향하고 우리 앱엔 일반 신고 진입점이
// 없어(상품 신고는 상품 상세에서 진입) 죽은 nav 대신 생략한다.
export function GuidelinesScreen() {
  const navigate = useNavigate()
  const router = useRouter()

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/settings' })
  }

  return (
    <MobileScreen header={<BackAppBar onBack={goBack} title="커뮤니티 가이드라인" />} contentClassName="pb-8">
      <DocumentHeader title="커뮤니티 가이드라인" revision={GUIDELINE_REVISION} />
      <div className="flex flex-col gap-6 p-4">
        <DocSection title="권장하는 행동">
          <ul className="flex flex-col gap-2.5">
            {GUIDELINE_GOOD.map(item => (
              <li key={item} className="flex items-start gap-2 text-body-sm text-text-secondary">
                <Check className="mt-0.5 size-[18px] flex-none text-success-fg" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </DocSection>

        <DocSection title="제한되는 행동">
          <ul className="flex flex-col gap-2.5">
            {GUIDELINE_BAD.map(item => (
              <li key={item} className="flex items-start gap-2 text-body-sm text-text-secondary">
                <X className="mt-0.5 size-[18px] flex-none text-error-fg" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </DocSection>

        <Alert variant="warning" title="위반 시 제재">
          신고가 접수되면 검토 후 정책에 따라 조치해요. 반복/중대 위반은 단계적으로 제재돼요.
        </Alert>
      </div>
    </MobileScreen>
  )
}
