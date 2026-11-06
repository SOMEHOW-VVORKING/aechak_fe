import { useId, useState } from 'react'
import { Alert, Avatar, BottomSheet, Button, StatusPill, Textarea } from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { RadioList } from '@/shared/components/RadioList'
import {
  isAlreadyReported,
  isFinalReportError,
  snsReportErrorMessage,
  useSubmitSnsReport,
  type SnsReportReason,
  type SnsReportTarget,
} from '../sns.queries'

// 사유 5종(b8-st-1 1-A). 게시물, 댓글, 사용자 신고가 같이 쓴다(P1). 목업의 가운뎃점과 띄운 슬래시는 카피 규칙대로 붙인 /로 적는다.
const REASONS: { value: SnsReportReason; label: string }[] = [
  { value: 'SPAM', label: '스팸/광고' },
  { value: 'ABUSE', label: '욕설/혐오 표현' },
  { value: 'INAPPROPRIATE', label: '음란/부적절한 콘텐츠' },
  { value: 'FRAUD', label: '사기/허위 정보' },
  { value: 'OTHER', label: '기타' },
]

const MAX_DETAIL = 500

interface SnsReportSheetProps {
  /** 닫히는 동안에도 마지막 대상을 그린다. 대상이 없으면 시트를 그리지 않는다 */
  target: SnsReportTarget | null
  open: boolean
  onClose: () => void
  /** 하단 탭바가 있는 화면은 접수 토스트를 탭바 위에 띄운다 */
  toastAboveActionBar?: boolean
}

// 신고 시트(b8-st-1 1-A). 게시물 더보기, 댓글 메뉴, 프로필 앱바 더보기, 차단 관리 목록이 같은 시트를 연다(P4).
// 실패하면 시트와 고른 사유, 상세 내용을 그대로 두고 안내한다(P15). 이미 신고한 대상(409)은 접수 확인으로 보고 닫는다(P6).
// 다시 보내도 같은 답인 거절(볼 수 없는 대상, 차단한 작성자, 내 게시물이나 댓글, 나 자신)은 시트를 닫고 토스트로 알린다.
// 요청 중에는 닫지 않는다. 닫히면 react-query가 호출별 성공, 실패 처리를 실행하지 않아 결과를 알릴 수 없다.
export function SnsReportSheet({ target, open, onClose, toastAboveActionBar }: SnsReportSheetProps) {
  const submit = useSubmitSnsReport()
  const reasonHeadingId = useId()
  const [reason, setReason] = useState<SnsReportReason | ''>('')
  const [detail, setDetail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ open: boolean; message: string; variant: 'info' | 'error' }>({
    open: false,
    message: '',
    variant: 'info',
  })
  // 시트를 열 때마다 입력을 비운다. 렌더 중에 맞춰 열린 첫 화면부터 빈 입력이다. 대상은 부르는 화면이 렌더마다 새로
  // 만들 수 있어 종류와 publicId로 비교한다.
  const targetKey = open && target ? `${target.type}:${target.publicId}` : null
  const [session, setSession] = useState<string | null>(null)
  if (session !== targetKey) {
    setSession(targetKey)
    if (targetKey != null) {
      setReason('')
      setDetail('')
      setError(null)
    }
  }

  const close = () => {
    if (!submit.isPending) onClose()
  }

  // 기타는 상세 내용이 필요하고 공백만 적은 값은 비운 것으로 본다(P5).
  const detailMissing = reason === 'OTHER' && detail.trim() === ''
  const canSubmit = reason !== '' && !detailMissing

  const handleSubmit = () => {
    if (!target || reason === '' || !canSubmit || submit.isPending) return
    setError(null)
    submit.mutate(
      { target, reasonCode: reason, reasonText: detail },
      {
        onSuccess: () => {
          onClose()
          setToast({ open: true, message: '신고가 접수되었습니다', variant: 'info' })
        },
        onError: e => {
          if (isAlreadyReported(e) || isFinalReportError(e)) {
            onClose()
            setToast({ open: true, message: snsReportErrorMessage(e), variant: isAlreadyReported(e) ? 'info' : 'error' })
          } else setError(snsReportErrorMessage(e))
        },
      },
    )
  }

  // 게시물과 댓글은 대상 카드에 내용 한 줄을 붙인다. 사용자는 닉네임만 그린다.
  const noun = target?.type === 'SNS_POST' ? '게시물' : target?.type === 'SNS_COMMENT' ? '댓글' : null

  return (
    <>
      {target && (
        <BottomSheet open={open} onClose={close} ariaLabel="신고하기">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2.5 rounded-card bg-surface-sunken px-3 py-2.5">
              <Avatar name={target.nickname} src={target.profileImageUrl ?? undefined} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-label font-semibold text-text-primary">
                  {target.nickname} 님{noun ? `의 ${noun}` : ''}
                </p>
                {noun && target.caption && (
                  <p className="truncate text-caption text-text-tertiary">{target.caption}</p>
                )}
              </div>
              <StatusPill variant="neutral">SNS</StatusPill>
            </div>

            <div className="flex flex-col gap-1">
              <p id={reasonHeadingId} className="text-subheading font-semibold text-text-primary">
                신고 사유를 선택해 주세요
              </p>
              <p className="break-keep text-body-sm text-text-secondary">
                커뮤니티 가이드 위반이 의심되는 {noun ?? '계정'}을 알려주세요. 신고자는 비공개로 보호돼요.
              </p>
            </div>

            {/* 공용 RadioList는 묶음 역할을 두지 않아 이 시트에서 사유 묶음의 이름과 필수를 붙인다. */}
            <div role="radiogroup" aria-labelledby={reasonHeadingId} aria-required="true">
              <RadioList name="sns-report-reason" options={REASONS} value={reason} onChange={setReason} />
            </div>

            <Textarea
              label={`상세 내용 ${reason === 'OTHER' ? '(필수)' : '(선택)'}`}
              value={detail}
              onChange={setDetail}
              maxLength={MAX_DETAIL}
              rows={3}
              placeholder="구체적인 상황을 적어주시면 검수에 도움이 돼요."
              aria-required={reason === 'OTHER' || undefined}
              helperText={detailMissing ? '기타 사유는 상세 내용을 적어 주세요.' : undefined}
            />

            {error && <Alert variant="error">{error}</Alert>}

            <Button size="lg" fullWidth disabled={!canSubmit} loading={submit.isPending} onClick={handleSubmit}>
              신고 제출
            </Button>
          </div>
        </BottomSheet>
      )}
      <AppToast
        open={toast.open}
        variant={toast.variant}
        message={toast.message}
        aboveActionBar={toastAboveActionBar}
        onClose={() => setToast(prev => ({ ...prev, open: false }))}
      />
    </>
  )
}
