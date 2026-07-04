import { useRef } from 'react'
import { ClearIcon } from './icons'

export interface PhotoUploadProps {
  photos: string[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
  max?: number
  disabled?: boolean
}

export function PhotoUpload({ photos, onAdd, onRemove, max = 5, disabled = false }: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const canAddMore = !disabled && photos.length < max

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {photos.map((src, index) => (
        <div
          key={index}
          className="relative size-[72px] flex-none rounded-md bg-surface-sunken bg-cover bg-center"
          style={{ backgroundImage: `url(${src})` }}
        >
          {!disabled && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label="사진 삭제"
              className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-surface-inverse text-surface-raised flex items-center justify-center"
            >
              <ClearIcon className="size-3" strokeWidth={2.5} />
            </button>
          )}
        </div>
      ))}
      {canAddMore && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="size-[72px] flex-none rounded-md border border-dashed border-border-strong bg-surface-sunken flex flex-col items-center justify-center gap-0.5 text-icon-muted"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7h3l2-3h8l2 3h3v13H3z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <span className="text-caption">{photos.length}/{max}</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) onAdd(files)
              e.target.value = ''
            }}
          />
        </button>
      )}
    </div>
  )
}
