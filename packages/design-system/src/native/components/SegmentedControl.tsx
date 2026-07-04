import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export interface SegmentedControlOption {
  value: string
  label: string
}

export interface SegmentedControlProps {
  options: SegmentedControlOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function SegmentedControl({ options, value, onChange, disabled }: SegmentedControlProps) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map(opt => {
        const selected = opt.value === value
        return (
          <Pressable
            key={opt.value}
            onPress={disabled || selected ? undefined : () => onChange(opt.value)}
            disabled={disabled}
            style={[styles.segment, selected && styles.segmentSelected]}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
          >
            <Text
              style={[
                styles.label,
                selected ? styles.labelSelected : styles.labelDefault,
                disabled && styles.labelDisabled,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSunken,
  },
  segment: {
    flex: 1,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
  },
  segmentSelected: {
    backgroundColor: theme.colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  label: {
    fontSize: theme.typography.fontSize.label,
    fontWeight: theme.typography.fontWeight.medium,
  },
  labelDefault: {
    color: theme.colors.textTertiary,
  },
  labelSelected: {
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  labelDisabled: {
    color: theme.colors.textDisabled,
  },
})
