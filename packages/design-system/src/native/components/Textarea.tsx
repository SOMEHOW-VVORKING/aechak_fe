import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native'
import { theme } from '../theme'

type TextareaState = 'default' | 'error' | 'success'

export interface TextareaProps
  extends Omit<TextInputProps, 'style' | 'multiline' | 'onChangeText' | 'onChange'> {
  label?: string
  state?: TextareaState
  helperText?: string
  maxLength?: number
  value?: string
  onChange?: (value: string) => void
}

const stateColor: Record<TextareaState, string> = {
  default: theme.colors.borderDefault,
  error: theme.colors.errorFg,
  success: theme.colors.successFg,
}

const helperColor: Record<TextareaState, string> = {
  default: theme.colors.textTertiary,
  error: theme.colors.errorFg,
  success: theme.colors.successFg,
}

export function Textarea({
  label,
  state = 'default',
  helperText,
  maxLength,
  value,
  onChange,
  editable = true,
  ...props
}: TextareaProps) {
  const charCount = value?.length ?? 0

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
        <TextInput
          multiline
          editable={editable}
          value={value}
          maxLength={maxLength}
          onChangeText={onChange}
          placeholderTextColor={theme.colors.textPlaceholder}
          style={[styles.input, !editable && styles.inputDisabled]}
          accessibilityLabel={label}
          {...props}
        />
        {maxLength != null && (
          <Text style={styles.count}>
            {charCount}/{maxLength}
          </Text>
        )}
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
    color: theme.colors.textSecondary,
  },
  field: {
    borderRadius: theme.radius.input,
    borderWidth: 1,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[6],
  },
  fieldDisabled: {
    backgroundColor: theme.colors.surfaceDisabled,
  },
  input: {
    minHeight: 96,
    fontSize: theme.typography.fontSize.body,
    color: theme.colors.textPrimary,
    textAlignVertical: 'top',
    padding: 0,
  },
  inputDisabled: {
    color: theme.colors.textDisabled,
  },
  count: {
    position: 'absolute',
    right: theme.spacing[3],
    bottom: theme.spacing[2],
    fontSize: theme.typography.fontSize.caption,
    color: theme.colors.textTertiary,
  },
  helper: {
    fontSize: theme.typography.fontSize.caption,
  },
})
