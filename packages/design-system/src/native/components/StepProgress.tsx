import { StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export interface StepProgressProps {
  current: number
  total: number
}

export function StepProgress({ current, total }: StepProgressProps) {
  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const isDone = i + 1 < current
        const isActive = i + 1 === current
        return (
          <View
            key={i}
            style={[
              styles.segment,
              isDone && styles.segmentDone,
              isActive && styles.segmentActive,
            ]}
          >
            <Text
              style={[
                styles.number,
                isDone && styles.numberDone,
                isActive && styles.numberActive,
              ]}
            >
              {i + 1}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: theme.spacing[2],
  },
  segment: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
  },
  segmentActive: {
    backgroundColor: theme.colors.brand,
    borderColor: theme.colors.brand,
  },
  segmentDone: {
    backgroundColor: '#2A8240',
    borderColor: '#2A8240',
  },
  number: {
    fontSize: theme.typography.fontSize.badge,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textTertiary,
  },
  numberActive: {
    color: theme.colors.onBrand,
  },
  numberDone: {
    color: '#FFFFFF',
  },
})
