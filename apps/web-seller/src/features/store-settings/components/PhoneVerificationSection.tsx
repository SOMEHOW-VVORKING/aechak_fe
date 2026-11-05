import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button, FormSection, Input } from '@aechak/design-system/web'
import { PHONE_CODE_LENGTH, phoneVerificationErrorMessage } from '../phone-verification.contract'
import { useConfirmPhoneCode, useSendPhoneCode } from '../phone-verification.queries'

// 입점 신청 화면의 휴대폰 본인 인증 블록. BE requirePhoneVerified()가 임시저장부터 403/10103으로
// 막으므로 신청 폼보다 위에 둔다 — 다 채운 뒤에 막히는 것보다 먼저 인증하게 하는 쪽이 낫다.
//
// 인증 여부를 조회해 분기하지 않는다(GET /users/me 없음) — 이미 인증한 계정도 그냥 다시 인증한다.
// 서버가 번호 점유를 덮어쓰므로 재인증에 별도 에러가 없고, 조회 한 번과 분기 하나를 덜 수 있다.
// 쿨다운·일 상한·입력 횟수는 서버가 429로 판정한다 — 화면은 타이머를 만들지 않고 그 문구만 보여준다.
export function PhoneVerificationSection() {
  const sendCode = useSendPhoneCode()
  const confirmCode = useConfirmPhoneCode()

  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [verified, setVerified] = useState(false)
  const [phoneError, setPhoneError] = useState<string>()
  const [codeError, setCodeError] = useState<string>()

  // BE(SendPhoneCodeRequest/ConfirmPhoneCodeRequest)는 @Pattern만 보고 trim하지 않는다 —
  // 붙여넣기로 섞인 앞뒤 공백은 여기서 걷어낸다(형식 판정은 그대로 서버 몫).
  const trimmedPhone = phone.trim()

  function handleSend() {
    setPhoneError(undefined)
    sendCode.mutate(trimmedPhone, {
      onSuccess: () => {
        setSent(true)
        setCode('')
        setCodeError(undefined)
      },
      onError: error => setPhoneError(phoneVerificationErrorMessage(error)),
    })
  }

  function handleConfirm() {
    setCodeError(undefined)
    confirmCode.mutate(
      { phoneNumber: trimmedPhone, code },
      {
        onSuccess: () => setVerified(true),
        onError: error => setCodeError(phoneVerificationErrorMessage(error, 'confirm')),
      },
    )
  }

  // 단계 번호를 주지 않는다 — 뒤따르는 폼 단계(판매자 유형 1 …) 번호를 밀지 않으려는 의도.
  return (
    <FormSection title="휴대폰 본인 인증">
      {verified ? (
        <p className="flex items-center gap-2 text-body-sm text-success-fg">
          <CheckCircle2 className="size-4 flex-none" />
          인증됐어요. 이제 신청서를 저장하고 제출할 수 있어요.
        </p>
      ) : (
        <>
          <p className="text-body-sm text-text-tertiary">
            입점 신청을 임시저장하려면 휴대폰 본인 인증이 필요해요.
          </p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="seller-verify-phone" className="text-label font-medium text-text-primary">
              휴대폰 번호
            </label>
            <div className="flex items-start gap-2">
              {/* DS Input에 flex-1을 직접 주면 내부 field 높이가 무너진다 — flex-1 래퍼로 감싼다. */}
              <div className="flex-1">
                <Input
                  id="seller-verify-phone"
                  value={phone}
                  inputMode="tel"
                  onChange={e => {
                    setPhone(e.target.value)
                    setPhoneError(undefined)
                  }}
                  placeholder="010-0000-0000"
                  state={phoneError ? 'error' : 'default'}
                  helperText={phoneError}
                />
              </div>
              <Button
                variant="secondary"
                onClick={handleSend}
                loading={sendCode.isPending}
                disabled={trimmedPhone === ''}
                className="flex-none"
              >
                {sent ? '인증번호 재발송' : '인증번호 받기'}
              </Button>
            </div>
          </div>

          {/* 발송 후에만 인증번호 칸을 연다. 자릿수는 네이티브 제약으로 돕고 최종 판정은 서버(90001)다. */}
          {sent && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="seller-verify-code" className="text-label font-medium text-text-primary">
                인증번호
              </label>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    id="seller-verify-code"
                    value={code}
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={PHONE_CODE_LENGTH}
                    onChange={e => {
                      setCode(e.target.value)
                      setCodeError(undefined)
                    }}
                    placeholder={`${PHONE_CODE_LENGTH}자리 숫자`}
                    state={codeError ? 'error' : 'default'}
                    helperText={codeError ?? '문자로 받은 인증번호를 입력해 주세요.'}
                    className="tabular-nums"
                  />
                </div>
                <Button
                  onClick={handleConfirm}
                  loading={confirmCode.isPending}
                  disabled={code === ''}
                  className="flex-none"
                >
                  인증 확인
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </FormSection>
  )
}
