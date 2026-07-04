export interface BarChartDatum {
  label: string
  value: number
}

export interface BarChartProps {
  data: BarChartDatum[]
  height?: number
  formatValue?: (value: number) => string
  color?: 'brand' | 'accent' | 'danger'
  className?: string
}

const barColorClass: Record<NonNullable<BarChartProps['color']>, string> = {
  brand: 'bg-brand',
  accent: 'bg-accent',
  danger: 'bg-danger',
}

export function BarChart({ data, height = 120, formatValue, color = 'brand', className = '' }: BarChartProps) {
  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div className={['flex items-end gap-2.5', className].filter(Boolean).join(' ')}>
      {data.map((d, i) => {
        const pct = Math.max(0, Math.min(100, (d.value / max) * 100))
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="w-full flex items-end" style={{ height }} title={formatValue ? formatValue(d.value) : String(d.value)}>
              <div
                className={`w-full rounded-t ${barColorClass[color]}`}
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="text-badge text-text-tertiary whitespace-nowrap">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}
