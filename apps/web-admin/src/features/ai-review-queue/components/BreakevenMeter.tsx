import type { CSSProperties } from 'react'
import { StatusPill } from '@aechak/design-system/web'
import {
  HARNESS_BREAKEVEN_RATE,
  UNMEASURED,
  formatCount,
  formatRate,
  type PromotionView,
} from '../ai-review-metrics.map'

interface BreakevenMeterProps {
  promotion: PromotionView
}

const clampPercent = (ratio: number): number => Math.max(0, Math.min(100, ratio * 100))

/** 기준선 라벨이 양 끝에서 잘리지 않게 가장자리에서는 붙여 둔다(가운데서는 선 위에 맞춘다). */
function markerPosition(percent: number): { className: string; style: CSSProperties } {
  if (percent < 14) return { className: 'left-0', style: {} }
  if (percent > 86) return { className: 'right-0', style: {} }
  return { className: '-translate-x-1/2', style: { left: `${percent}%` } }
}

/**
 * 승급률 계기 — 손익분기 기준선을 넘었는지 한눈에 보이게 한다.
 *
 * 이 한 숫자에 선별 계층의 가치가 걸려 있다. 선별은 Haiku 호출을 한 번 더하는 대신 Sonnet 두
 * 관점을 건너뛰어 돈을 아끼는 장치인데, 승급률이 손익분기를 넘으면 **아끼는 것보다 더하는 것이
 * 많아진다.** 그래서 비율 하나가 아니라 "그 선을 넘었는가"를 보여 주는 형태로 그린다.
 *
 * 기준선이 둘일 수 있다. 굵은 선은 **서버가 보낸 값**이다 — 서버의 초과 판정과 주기 로그 경보가
 * 그 값으로 계산되므로, 화면이 다른 값으로 선을 그리면 선과 경보가 서로 다른 말을 한다.
 * 가는 선은 측정 하네스의 정본(62.0%)이고 서버 값과 다를 때만 그린다. 두 값 사이 구간에서는
 * 서버가 "손익분기 초과"라고 경보하지만 실제로는 아직 이득이므로, 그 구간을 숫자로 밝혀 둔다.
 */
export function BreakevenMeter({ promotion }: BreakevenMeterProps) {
  const ratePercent = promotion.promotionRate == null ? null : clampPercent(promotion.promotionRate)
  const serverPercent = clampPercent(promotion.breakevenRate)
  const harnessPercent = clampPercent(HARNESS_BREAKEVEN_RATE)
  const serverMarker = markerPosition(serverPercent)
  const harnessMarker = markerPosition(harnessPercent)
  const over = promotion.overBreakeven

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="text-caption text-text-tertiary">승급률</p>
          {/* 큰 숫자에는 tabular-nums를 쓰지 않는다 — 자릿폭이 0에 맞춰져 느슨하게 보인다. */}
          <p className="text-display font-semibold leading-tight text-text-primary">
            {formatRate(promotion.promotionRate)}
          </p>
        </div>
        <div className="space-y-1 text-right">
          <StatusPill variant={over ? 'error' : 'success'} dot>
            {over ? '손익분기 초과' : '손익분기 아래'}
          </StatusPill>
          {/* 숫자는 기준선 라벨이 이미 적는다 — 여기서는 그 값이 어디서 왔는지만 말한다. */}
          <p className="text-caption text-text-tertiary">기준선은 서버 설정 값이에요</p>
        </div>
      </div>

      {/* 서버 기준선 라벨 — 선 위에 둔다. 하네스 참고선 라벨은 아래라 둘이 겹치지 않는다. */}
      <div className="relative h-4">
        <span
          className={`absolute whitespace-nowrap text-caption font-semibold text-text-primary ${serverMarker.className}`}
          style={serverMarker.style}
        >
          손익분기 {formatRate(promotion.breakevenRate)}
        </span>
      </div>

      <div
        className={`relative h-6 w-full overflow-hidden rounded-sm border ${
          over ? 'border-error-border bg-error-surface' : 'border-brand-border bg-brand-subtle'
        }`}
      >
        {ratePercent != null && (
          <div
            className={`h-full rounded-r-[4px] ${over ? 'bg-error' : 'bg-brand'}`}
            style={{ width: `${ratePercent}%` }}
          />
        )}
        <span
          className="absolute inset-y-0 w-0.5 bg-text-primary"
          style={{ left: `${serverPercent}%` }}
          aria-hidden="true"
        />
        {promotion.breakevenDisputed && (
          <span
            className="absolute inset-y-0 w-0.5 bg-accent"
            style={{ left: `${harnessPercent}%` }}
            aria-hidden="true"
          />
        )}
      </div>

      {promotion.breakevenDisputed && (
        <div className="relative h-4">
          <span
            className={`absolute whitespace-nowrap text-caption text-accent ${harnessMarker.className}`}
            style={harnessMarker.style}
          >
            하네스 정본 {formatRate(HARNESS_BREAKEVEN_RATE)}
          </span>
        </div>
      )}

      <p className="break-keep text-body-sm text-text-secondary">
        {ratePercent == null
          ? `선별 호출이 나간 검수가 없어 승급률이 ${UNMEASURED}이에요. 선별을 켤지 말지는 이 값으로 판단해야 해요.`
          : over
            ? '승급률이 기준을 넘었어요 — 선별이 아끼는 호출보다 더하는 호출이 많은 구간이에요.'
            : '승급률이 기준 아래예요 — 선별이 관점 호출을 줄여 비용을 아끼고 있어요.'}
      </p>

      {promotion.breakevenDisputed && (
        // 서버 설정과 하네스 정본이 다르면 그 사이 구간에서 서버 경보가 거짓이 된다.
        // 어느 쪽을 믿을지는 사람이 정할 일이고, 화면은 두 값과 그 구간을 밝히는 데까지 한다.
        <p className="break-keep text-caption text-warning-fg">
          서버 설정({formatRate(promotion.breakevenRate)})과 측정 하네스 정본(
          {formatRate(HARNESS_BREAKEVEN_RATE)})이 달라요. 승급률이 두 값 사이에 있으면 서버는{' '}
          <strong>초과</strong>로 경보하지만 실제로는 아직 이득인 구간이에요. 설정을 정본에 맞춰
          주세요.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border-subtle pt-3">
        <MeterFigure label="선별이 돈 검수" value={`${formatCount(promotion.triagedCount)}건`} />
        <MeterFigure
          label="건너뜀 / 승급"
          value={`${formatCount(promotion.clearedCount)} / ${formatCount(promotion.promotedCount)}건`}
        />
        <MeterFigure label="건너뛰기율" value={formatRate(promotion.skipRate)} />
        <MeterFigure
          // 선별 호출이 깨진 건은 승급으로 센다 — 관점 호출이 실제로 나갔으므로 비용으로는 같다.
          label="선별 호출 실패"
          value={
            promotion.callFailedCount == null
              ? UNMEASURED
              : `${formatCount(promotion.callFailedCount)}건`
          }
        />
      </dl>

      {promotion.bypassedByRuleHitCount != null && promotion.bypassedByRuleHitCount > 0 && (
        <p className="break-keep text-caption text-text-tertiary">
          규칙이 적중해 선별을 묻지 않고 승급한 {formatCount(promotion.bypassedByRuleHitCount)}건은
          위 분모에 없어요 — 1단 통과 수와 선별 진입 수가 다른 까닭이에요.
        </p>
      )}

      {promotion.source === 'promotion' && (
        <p className="break-keep text-caption text-text-tertiary">
          서버가 단계별 집계를 아직 주지 않아 승급률 블록만 읽었어요. 건너뛰기율은 승급률의
          여집합으로 계산한 값이에요.
        </p>
      )}
    </div>
  )
}

function MeterFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-text-tertiary">{label}</dt>
      <dd className="text-body-sm font-medium tabular-nums text-text-primary">{value}</dd>
    </div>
  )
}
