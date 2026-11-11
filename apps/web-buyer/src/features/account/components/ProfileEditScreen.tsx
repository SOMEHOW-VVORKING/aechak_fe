import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertCircle, Camera, User } from 'lucide-react'
import {
  Alert,
  BottomFixedAction,
  Button,
  Input,
  MobileScreen,
  Skeleton,
  StatusPill,
  Textarea,
} from '@aechak/design-system/web'
import { AppToast } from '@/shared/components/AppToast'
import { BackAppBar } from '@/shared/components/BackAppBar'
import { HomeAction } from '@/shared/components/HomeAction'
import { ScreenEmptyState } from '@/shared/components/ScreenEmptyState'
import { useSafeBack } from '@/shared/useSafeBack'
import {
  accountErrorMessage,
  avatarUploadErrorMessage,
  isOnboardingRequired,
  isWithinAvatarSizeLimit,
  OVERSIZED_AVATAR_MESSAGE,
  uploadAvatar,
  useMe,
  useUpdateProfile,
} from '@/shared/account'
import { BIO_MAX, NICKNAME_MAX } from '../account.mock'

// 저장 성공 토스트를 잠깐 보여준 뒤 뒤로 가기까지의 시간. 내비게이션은 이 타이머로만 돌린다.
const PROFILE_SAVED_TOAST_MS = 1500

// 프로필 수정(b10-st-2). 닉네임/자기소개/아바타 편집. 초기값·저장은 실서버(GET /users/me · PUT /users/me/profile).
// 닉네임 형식(30002)·중복(30001)은 서버가 저장 시점에 판정하고 화면은 그 문구를 Alert로 보여준다 — 클라이언트 정규식 없음.
// 글자수 카운터(기획 b10-st-2의 4/12)와 maxLength만 남긴다.
// 아바타는 저장 시점에 presigned(USER_PROFILE) 업로드로 tmp 키를 만들고, 안 바꾸면 조회에서 받은 기존 키를 그대로 되돌려 보낸다.
// 휴대폰 본인 인증 표시도 서버(isPhoneVerified·마스킹 phoneNumber)가 진실 원본이다 — 인증 화면과 같은 캐시를 읽는다.
export function ProfileEditScreen() {
  const navigate = useNavigate()
  const { account, isError, refetch } = useMe()
  const updateProfile = useUpdateProfile()
  const goBack = useSafeBack({ to: '/mypage' })

  const [nickname, setNickname] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined)
  // 유지 회신용 기존 키(조회가 준 값). 새 파일을 안 고르면 저장 시 이 값을 그대로 되돌려 보낸다(URL 역파싱 금지).
  const [imageKey, setImageKey] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [toastOpen, setToastOpen] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const seededRef = useRef(false)
  const backTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 서버 값으로 폼을 한 번만 시드한다(저장 후 invalidate로 재조회돼도 재시딩하지 않아 입력 값을 보존).
  useEffect(() => {
    if (account && !seededRef.current) {
      seededRef.current = true
      setNickname(account.nickname)
      setBio(account.bio)
      setAvatarUrl(account.avatarUrl)
      setImageKey(account.profileImageKey ?? null)
    }
  }, [account])

  // 마지막 프리뷰 objectURL은 언마운트 시 정리한다(누수 방지). 예약된 뒤로가기 타이머도 함께 정리한다.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      if (backTimerRef.current) clearTimeout(backTimerRef.current)
    }
  }, [])

  // 토스트 닫힘은 리렌더마다 새로 만들면 DS Toast의 자동 닫힘 타이머(deps에 onClose 포함)가 리셋된다.
  // useCallback으로 안정화해 입력 중 리렌더가 토스트 타이머를 되감지 않게 한다. 내비게이션은 아래 자체 타이머로만 돈다.
  const handleToastClose = useCallback(() => setToastOpen(false), [])

  const onPickPhoto = () => fileRef.current?.click()
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError(null)
    // presigned PUT은 S3 직행이라 서버가 크기를 못 막는다 — 발급 전에 여기서 걸러 안내한다(형식은 서버 몫).
    if (!isWithinAvatarSizeLimit(file)) {
      setUploadError(OVERSIZED_AVATAR_MESSAGE)
      return
    }
    // 이전 프리뷰 URL을 먼저 정리하고 새 프리뷰를 만든다. 업로드는 저장 시점에 한 번만 한다.
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = URL.createObjectURL(file)
    previewUrlRef.current = url
    setAvatarUrl(url)
    setPendingFile(file)
  }

  const handleSave = async () => {
    setSaveError(null)
    // 안 바꿨으면 기존 키를 유지, 새로 골랐으면 저장 시점에 업로드해 tmp 키로 교체.
    let keyToSubmit = imageKey
    if (pendingFile) {
      setIsUploading(true)
      try {
        keyToSubmit = await uploadAvatar(pendingFile)
      } catch (err) {
        setIsUploading(false)
        setSaveError(avatarUploadErrorMessage(err))
        return
      }
      setIsUploading(false)
    }
    updateProfile.mutate(
      {
        // 세 필드 항상 전송(전체 교체). 닉네임은 입력 그대로(서버가 trim·NFC 정규화·형식 판정).
        // 자기소개는 BE가 @Size만 보고 그대로 저장하므로(trim 없음) 공백만 있으면 비운 것으로 보고 null로 지운다.
        nickname,
        bio: bio.trim() || null,
        profileImageKey: keyToSubmit,
      },
      {
        onSuccess: () => {
          setToastOpen(true)
          // 성공 시점에 한 번만 뒤로가기를 예약한다(리렌더로 리셋되지 않게 Toast onClose가 아니라 자체 타이머로).
          if (backTimerRef.current == null) {
            backTimerRef.current = setTimeout(() => goBack(), PROFILE_SAVED_TOAST_MS)
          }
        },
        onError: err => {
          // PENDING이 ACTIVE 전용 PUT을 부르면 20006 — 인라인 문구로 막다른 길 대신 온보딩으로 보낸다.
          if (isOnboardingRequired(err)) {
            navigate({ to: '/onboarding/terms', replace: true })
            return
          }
          setSaveError(accountErrorMessage(err))
        },
      },
    )
  }

  const saving = isUploading || updateProfile.isPending

  const goBackHeader = <BackAppBar onBack={goBack} title="프로필 수정" actions={<HomeAction />} />

  if (isError) {
    return (
      <MobileScreen header={goBackHeader}>
        <ScreenEmptyState
          title="프로필을 불러오지 못했어요"
          description="잠시 후 다시 시도해주세요."
          action={{ label: '다시 시도', onClick: () => void refetch() }}
        />
      </MobileScreen>
    )
  }

  if (!account) {
    return (
      <MobileScreen header={goBackHeader}>
        <div className="flex flex-col gap-6 p-4">
          <Skeleton variant="circle" className="mx-auto size-[88px]" />
          <Skeleton className="h-10 rounded-input" />
          <Skeleton className="h-24 rounded-input" />
        </div>
      </MobileScreen>
    )
  }

  // 서버가 마스킹해 내려주는 번호(인증 전 null)를 그대로 표시한다 — 클라이언트 마스킹 없음.
  const verified = account.verification === 'verified'
  const maskedPhone = account.phone || '아직 인증된 번호가 없어요'

  return (
    <MobileScreen
      header={goBackHeader}
      footer={
        <BottomFixedAction
          primary={{
            label: '저장',
            onClick: () => void handleSave(),
            loading: saving,
          }}
        />
      }
    >
      <div className="flex flex-col gap-6 p-4">
        {saveError && (
          <Alert variant="error" onDismiss={() => setSaveError(null)}>
            {saveError}
          </Alert>
        )}

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
          {uploadError && (
            <p role="alert" className="text-caption text-error-fg">
              {uploadError}
            </p>
          )}
          {/* accept는 서버 허용 형식(UploadPurpose.USER_PROFILE)과 같다 — 선택기에서 먼저 거르고 최종 판정은 presign 서버(100000). */}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onFileChange}
          />
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
        onClose={handleToastClose}
        duration={PROFILE_SAVED_TOAST_MS}
        message="프로필을 저장했어요."
        variant="success"
        aboveActionBar
      />
    </MobileScreen>
  )
}
