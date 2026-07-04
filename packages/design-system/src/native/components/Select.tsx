import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'
import { BottomSheet } from './BottomSheet'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  label?: string
  placeholder?: string
  options: SelectOption[]
  value?: string
  error?: string
  disabled?: boolean
  onChange?: (value: string) => void
}

export function Select({
  label,
  placeholder,
  options,
  value,
  error,
  disabled,
  onChange,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.value === value)

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <Pressable
        onPress={disabled ? undefined : () => setOpen(true)}
        disabled={disabled}
        style={[
          styles.field,
          { borderColor: error ? theme.colors.errorFg : theme.colors.borderDefault },
          disabled && styles.fieldDisabled,
        ]}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
      >
        <Text
          style={[
            styles.value,
            !selected && styles.placeholder,
            disabled && styles.valueDisabled,
          ]}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder ?? ''}
        </Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}

      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <View style={styles.sheetBody}>
          {label && <Text style={styles.sheetTitle}>{label}</Text>}
          {options.map(opt => (
            <Pressable
              key={opt.value}
              onPress={() => {
                onChange?.(opt.value)
                setOpen(false)
              }}
              style={styles.option}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.optionLabel,
                  opt.value === value && styles.optionLabelSelected,
                ]}
              >
                {opt.label}
              </Text>
              {opt.value === value && <Text style={styles.check}>✓</Text>}
            </Pressable>
          ))}
        </View>
      </BottomSheet>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.input,
    borderWidth: 1,
    backgroundColor: theme.colors.surface,
  },
  fieldDisabled: {
    backgroundColor: theme.colors.surfaceDisabled,
  },
  value: {
    flex: 1,
    fontSize: theme.typography.fontSize.bodySm,
    color: theme.colors.textPrimary,
  },
  valueDisabled: {
    color: theme.colors.textDisabled,
  },
  placeholder: {
    color: theme.colors.textPlaceholder,
  },
  chevron: {
    fontSize: 16,
    color: theme.colors.textTertiary,
    marginLeft: theme.spacing[2],
  },
  error: {
    fontSize: theme.typography.fontSize.caption,
    color: theme.colors.errorFg,
  },
  sheetBody: {
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  sheetTitle: {
    fontSize: theme.typography.fontSize.subheading,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing[2],
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
  },
  optionLabel: {
    fontSize: theme.typography.fontSize.body,
    color: theme.colors.textPrimary,
  },
  optionLabelSelected: {
    color: theme.colors.brand,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  check: {
    color: theme.colors.brand,
    fontSize: 15,
  },
})
