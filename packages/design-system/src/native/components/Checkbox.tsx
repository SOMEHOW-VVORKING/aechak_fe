import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export interface CheckboxProps {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  error?: boolean
  label?: string
  onChange?: (checked: boolean) => void
}

export function Checkbox({
  checked,
  indeterminate = false,
  disabled,
  error,
  label,
  onChange,
}: CheckboxProps) {
  const isFilled = checked || indeterminate

  return (
    <Pressable
      onPress={disabled ? undefined : () => onChange?.(!checked)}
      disabled={disabled}
      style={styles.row}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: indeterminate ? 'mixed' : checked, disabled }}
    >
      <View
        style={[
          styles.box,
          isFilled
            ? { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand }
            : { borderColor: error ? theme.colors.errorFg : theme.colors.borderDefault },
          disabled && styles.boxDisabled,
        ]}
      >
        {checked && !indeterminate && <Text style={styles.mark}>✓</Text>}
        {indeterminate && <View style={styles.indeterminateMark} />}
      </View>
      {label && (
        <Text
          style={[
            styles.label,
            disabled
              ? { color: theme.colors.textDisabled }
              : error
                ? { color: theme.colors.errorFg }
                : { color: theme.colors.textPrimary },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    alignSelf: 'flex-start',
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: theme.radius.xs,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxDisabled: {
    opacity: 0.6,
  },
  mark: {
    color: theme.colors.onBrand,
    fontSize: 13,
    fontWeight: theme.typography.fontWeight.bold,
  },
  indeterminateMark: {
    width: 10,
    height: 2,
    backgroundColor: theme.colors.onBrand,
    borderRadius: 1,
  },
  label: {
    fontSize: theme.typography.fontSize.bodySm,
  },
})
