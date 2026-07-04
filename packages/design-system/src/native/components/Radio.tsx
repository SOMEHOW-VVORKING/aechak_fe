import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export interface RadioProps {
  checked: boolean
  disabled?: boolean
  label?: string
  name?: string
  value?: string
  onChange?: () => void
}

export function Radio({ checked, disabled, label, onChange }: RadioProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onChange}
      disabled={disabled}
      style={styles.row}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled }}
    >
      <View
        style={[
          styles.outer,
          { borderColor: checked ? theme.colors.brand : theme.colors.borderStrong },
          disabled && styles.disabled,
        ]}
      >
        {checked && <View style={styles.inner} />}
      </View>
      {label && (
        <Text
          style={[
            styles.label,
            { color: disabled ? theme.colors.textDisabled : theme.colors.textPrimary },
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
  outer: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
  inner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: theme.colors.brand,
  },
  label: {
    fontSize: theme.typography.fontSize.bodySm,
  },
})
