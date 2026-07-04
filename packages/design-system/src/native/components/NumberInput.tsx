import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}

export function NumberInput({
  value,
  onChange,
  min = 1,
  max = Infinity,
  step = 1,
  disabled,
}: NumberInputProps) {
  const canDecrease = !disabled && value - step >= min
  const canIncrease = !disabled && value + step <= max

  return (
    <View style={[styles.container, disabled && styles.disabled]}>
      <Pressable
        onPress={canDecrease ? () => onChange(value - step) : undefined}
        disabled={!canDecrease}
        style={styles.button}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="수량 감소"
      >
        <Text style={[styles.symbol, !canDecrease && styles.symbolDisabled]}>−</Text>
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable
        onPress={canIncrease ? () => onChange(value + step) : undefined}
        disabled={!canIncrease}
        style={styles.button}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="수량 증가"
      >
        <Text style={[styles.symbol, !canIncrease && styles.symbolDisabled]}>+</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    alignSelf: 'flex-start',
  },
  disabled: {
    backgroundColor: theme.colors.surfaceDisabled,
  },
  button: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: {
    fontSize: 16,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  symbolDisabled: {
    color: theme.colors.textDisabled,
  },
  value: {
    minWidth: 32,
    textAlign: 'center',
    fontSize: theme.typography.fontSize.bodySm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
  },
})
