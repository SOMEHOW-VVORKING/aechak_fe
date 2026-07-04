import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export interface ToggleProps {
  checked: boolean
  disabled?: boolean
  label?: string
  onChange?: (checked: boolean) => void
}

export function Toggle({ checked, disabled, label, onChange }: ToggleProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : () => onChange?.(!checked)}
      disabled={disabled}
      style={styles.row}
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
    >
      <View
        style={[
          styles.track,
          { backgroundColor: checked ? theme.colors.brand : theme.colors.borderStrong },
          disabled && styles.disabled,
        ]}
      >
        <View style={[styles.thumb, checked && styles.thumbChecked]} />
      </View>
      {label && (
        <Text
          style={[
            styles.label,
            { color: disabled ? theme.colors.textDisabled : theme.colors.textSecondary },
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
  track: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  thumbChecked: {
    transform: [{ translateX: 18 }],
  },
  label: {
    fontSize: theme.typography.fontSize.label,
  },
})
