import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle, Camera, User } from 'lucide-react'
import {
  BottomFixedAction,
  Button,
  Input,
  MobileScreen,
  StatusPill,
  Textarea,
} from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { useSafeBack } from '@/shared/useSafeBack'
import { maskPhone, useAccount } from '@/shared/account'
import { placeholderImage } from '@/shared/catalog'
import { useUpdateProfile } from '../account.queries'
import { BIO_MAX, NICKNAME_MAX, validateNickname } from '../account.mock'

// 프로필 수정(b10-st-2). 닉네임/자기소개/아바타 편집 + 본인 인증 상태 표시. 저장 → 성공 토스트.
export function ProfileEditScreen() {
  const navigate = useNavigate()
  const account = useAccount()
  const updateProfile = useUpdateProfile()

  // 폼 상태는 시드 계정에서 한 번만 초기화한다(주소록 폼과 동일 — 저장 후 재시딩하지 않음).
  const [nickname, setNickname] = useState(account.nickname)
  const [bio, setBio] = useState(account.bio)
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(account.avatarUrl)
  const [toastOpen, setToastOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const goBack = useSafeBack({ to: '/mypage' })

  const nicknameCheck = validateNickname(nickname)
  const showNicknameMsg = nickname.trim().length > 0

  const onPickPhoto = () => fileRef.current?.click()
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(file)
        : placeholderImage(120)
    setAvatarUrl(url)
  }

  const handleSave = () => {
    if (!nicknameCheck.ok) return
    updateProfile.mutate(
      { nickname: nickname.trim(), bio, avatarUrl },
      { onSuccess: () => setToastOpen(true) },
    )
  }

  const verified = account.verification === 'verified'
  const maskedPhone = verified ? account.verifiedPhoneMasked ?? maskPhone(account.phone) : maskPhone(account.phone)

  return (
    <MobileScreen
      header={<BackAppBar onBack={goBack} title="프로필 수정" />}
      footer={
        <BottomFixedAction
          primary={{
            label: '저장',
            onClick: handleSave,
            disabled: !nicknameCheck.ok,
            loading: updateProfile.isPending,
          }}
        />
      }
    >
      <div className="flex flex-col gap-6 p-4">
        {/* 프로필 사진 */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <button
            type="button"
            onClick={onPickPhoto}
            className="relative rounded-full focus-visible:outline-none focus-visible:shadow-focus-ring"
            aria-label="사진 변경"
          >
            <span className="flex size-[88px] items-center justify-center overflow-hidden rounded-full bg-surface-sunken text-icon-muted">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                <User className="size-9" />
              )}
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 flex size-[30px] items-center justify-center rounded-full border-2 border-surface-base bg-brand text-brand-on">
              <Camera className="size-4" />
            </span>
          </button>
          <button type="button" onClick={onPickPhoto} className="text-label font-medium text-text-link">
            사진 변경
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
        </div>

        {/* 닉네임 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="profile-nickname" className="text-label font-medium text-text-primary">
              닉네임
            </label>
            <span className="tabular-nums text-caption text-text-tertiary">
              {nickname.length}/{NICKNAME_MAX}
            </span>
          </div>
          <Input
            id="profile-nickname"
            value={nickname}
            maxLength={NICKNAME_MAX}
            onChange={e => setNickname(e.target.value)}
            state={showNicknameMsg ? (nicknameCheck.ok ? 'success' : 'error') : 'default'}
            helperText={showNicknameMsg ? nicknameCheck.message : undefined}
            placeholder="닉네임을 입력해 주세요"
          />
        </div>

        {/* 자기소개 */}
        <Textarea
          label="자기소개"
          value={bio}
          onChange={setBio}
          maxLength={BIO_MAX}
          rows={4}
          helperText="프로필에 표시돼요."
          placeholder="나와 반려동물을 소개해 주세요."
        />

        {/* 휴대폰 번호(읽기전용 + 인증 상태) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-label font-medium text-text-primary">휴대폰 번호</span>
          <div className="flex h-10 items-center gap-2 rounded-input border border-border bg-surface-disabled px-4">
            <span className="flex-1 tabular-nums text-body text-text-secondary">{maskedPhone}</span>
            {/* 인증 완료 시 인증 배지는 '본인 인증' 메뉴 행/인증 화면과 중복이라 안 그린다.
                미인증 배지는 아래 '본인 인증하기' 버튼과 함께 인증 유도 역할이라 유지. */}
            {!verified && (
              <StatusPill variant="warning" size="sm">
                <AlertCircle className="mr-0.5 inline size-3" />
                미인증
              </StatusPill>
            )}
          </div>
          {!verified && (
            <Button
              variant="secondary"
              size="sm"
              fullWidth
              onClick={() => navigate({ to: '/mypage/verify' })}
              className="mt-1"
            >
              본인 인증하기
            </Button>
          )}
        </div>
      </div>

      <AppToast
        open={toastOpen}
        onClose={() => setToastOpen(false)}
        message="프로필을 저장했어요."
        variant="success"
        aboveActionBar
      />
    </MobileScreen>
  )
}
