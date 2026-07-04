export interface PermissionMatrixRole {
  key: string
  label: string
}

export interface PermissionMatrixRow {
  key: string
  label: string
}

export interface PermissionMatrixProps {
  roles: PermissionMatrixRole[]
  rows: PermissionMatrixRow[]
  value: Record<string, string[]>
  onChange?: (value: Record<string, string[]>) => void
  menuLabel?: string
}

export function PermissionMatrix({ roles, rows, value, onChange, menuLabel = '메뉴 / 역할' }: PermissionMatrixProps) {
  const readOnly = !onChange

  function toggle(rowKey: string, roleKey: string) {
    if (!onChange) return
    const current = value[rowKey] ?? []
    const next = current.includes(roleKey)
      ? current.filter(k => k !== roleKey)
      : [...current, roleKey]
    onChange({ ...value, [rowKey]: next })
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border-subtle bg-surface-raised shadow-card">
      <table className="w-full text-left text-body-sm">
        <thead>
          <tr className="border-b border-border-subtle bg-surface-sunken">
            <th className="px-3 py-2.5 text-label font-semibold text-text-secondary whitespace-nowrap">
              {menuLabel}
            </th>
            {roles.map(role => (
              <th key={role.key} className="px-3 py-2.5 text-label font-semibold text-text-secondary text-center whitespace-nowrap">
                {role.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="border-b border-border-subtle last:border-0">
              <td className="px-3 py-2.5 font-semibold text-text-primary whitespace-nowrap">{row.label}</td>
              {roles.map(role => {
                const hasAccess = (value[row.key] ?? []).includes(role.key)
                return (
                  <td key={role.key} className="px-3 py-2.5 text-center">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => toggle(row.key, role.key)}
                      aria-label={`${row.label} · ${role.label} 접근 권한 ${hasAccess ? '있음' : '없음'}`}
                      aria-pressed={hasAccess}
                      className={[
                        'inline-flex items-center justify-center size-6 rounded transition-colors',
                        readOnly ? '' : 'hover:bg-surface-hover',
                      ].join(' ')}
                    >
                      {hasAccess ? (
                        <svg className="size-4 text-success-fg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : (
                        <svg className="size-4 text-text-disabled" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                          <path d="M5 12h14" />
                        </svg>
                      )}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
