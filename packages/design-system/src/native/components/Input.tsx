import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native'
import { theme } from '../theme'

type InputState = 'default' | 'error' | 'success'

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string
  helperText?: string
  state?: InputState
  leftAddon?: ReactNode
  rightAddon?: ReactNode
  clearable?: boolean
  onClear?: () => void
}

const stateColor: Record<InputState, string> = {
  default: theme.colors.borderDefault,
  error: theme.colors.errorFg,
  success: theme.colors.successFg,
}

const helperColor: Record<InputState, string> = {
  default: theme.colors.textTertiary,
  error: theme.colors.errorFg,
  success: theme.colors.successFg,
}

export function Input({
  label,
  helperText,
  state = 'default',
  leftAddon,
  rightAddon,
  clearable = false,
  onClear,
  editable = true,
  value,
  ...props
}: InputProps) {
  const showClear = clearable && editable && !!value

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.field,
          { borderColor: stateColor[state] },
          !editable && styles.fieldDisabled,
        ]}
      >
        {leftAddon && <View style={styles.addon}>{leftAddon}</View>}
        <TextInput
          editable={editable}
          value={value}
          placeholderTextColor={theme.colors.textPlaceholder}
          style={[styles.input, !editable && styles.inputDisabled]}
          accessibilityLabel={label}
          {...props}
        />
        {showClear && (
          <Pressable
            onPress={onClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="입력 초기화"
          >
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        )}
        {!showClear && rightAddon && <View style={styles.addon}>{rightAddon}</View>}
      </View>
      {helperText && (
        <Text style={[styles.helper, { color: helperColor[state] }]}>{helperText}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: theme.typography.fontSize.label,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    height: 44,
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.input,
    borderWidth: 1,
    backgroundColor: theme.colors.surface,
  },
  fieldDisabled: {
    backgroundColor: theme.colors.surfaceDisabled,
  },
  addon: {
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    fontSize: theme.typography.fontSize.body,
    color: theme.colors.textPrimary,
  },
  inputDisabled: {
    color: theme.colors.textDisabled,
  },
  clear: {
    fontSize: 14,
    color: theme.colors.textTertiary,
  },
  helper: {
    fontSize: theme.typography.fontSize.caption,
  },
})
