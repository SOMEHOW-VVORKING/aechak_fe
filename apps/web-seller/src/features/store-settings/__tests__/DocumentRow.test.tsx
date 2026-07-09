import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { DocumentRow } from '../components/DocumentRow'

beforeAll(() => {
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => 'blob:mock')
  }
})

describe('DocumentRow', () => {
  it('[AC-STORE-SETTINGS-003] shows an emphasized label and an upload button when resubmission is required', () => {
    render(
      <DocumentRow
        document={{ key: 'bankbook', label: '통장 사본', status: 'resubmission-required', required: true }}
        onUpload={vi.fn()}
      />,
    )

    expect(screen.getByText('재제출 필요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /업로드/ })).toBeInTheDocument()
  })

  it('[AC-STORE-SETTINGS-004] expands the file picker when the upload button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <DocumentRow
        document={{ key: 'bankbook', label: '통장 사본', status: 'resubmission-required', required: true }}
        onUpload={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /업로드/ }))

    expect(screen.getByText('0/1')).toBeInTheDocument()
  })

  it('[AC-STORE-SETTINGS-005] calls onUpload with the document key once a file is selected', async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn()
    render(
      <DocumentRow
        document={{ key: 'bankbook', label: '통장 사본', status: 'resubmission-required', required: true }}
        onUpload={onUpload}
      />,
    )

    await user.click(screen.getByRole('button', { name: /업로드/ }))
    const file = new File(['dummy'], 'bankbook.png', { type: 'image/png' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, file)

    expect(onUpload).toHaveBeenCalledWith('bankbook')
  })

  it('[AC-STORE-SETTINGS-006] shows a 교체 button for already-submitted documents without emphasis', () => {
    render(
      <DocumentRow
        document={{ key: 'business-reg', label: '사업자등록증', status: 'submitted' }}
        onUpload={vi.fn()}
      />,
    )

    expect(screen.getByText('제출 완료')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '교체' })).toBeInTheDocument()
  })

  it('[AC-STORE-SETTINGS-007] shows no action button for not-applicable documents', () => {
    render(
      <DocumentRow
        document={{ key: 'seal-cert', label: '인감증명서', status: 'not-applicable' }}
        onUpload={vi.fn()}
      />,
    )

    expect(screen.getByText('해당 없음')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
