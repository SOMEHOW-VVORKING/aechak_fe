import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native'
import { theme } from '../theme'

export interface SearchInputProps extends Omit<TextInputProps, 'style'> {
  onClear?: () => void
}

export function SearchInput({ value, onClear, ...props }: SearchInputProps) {
  const showClear = !!onClear && !!value

  return (
    <View style={styles.field}>
      <Text style={styles.icon}>⌕</Text>
      <TextInput
        value={value}
        placeholder="검색"
        placeholderTextColor={theme.colors.textPlaceholder}
        returnKeyType="search"
        style={styles.input}
        {...props}
      />
      {showClear && (
        <Pressable
          onPress={onClear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="검색어 지우기"
        >
          <Text style={styles.clear}>✕</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[2],
    height: 40,
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSunken,
  },
  icon: {
    fontSize: 16,
    color: theme.colors.textTertiary,
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    fontSize: theme.typography.fontSize.bodySm,
    color: theme.colors.textPrimary,
  },
  clear: {
    fontSize: 13,
    color: theme.colors.textTertiary,
  },
})
