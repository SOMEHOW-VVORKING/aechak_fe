import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

interface AppBarProps {
  title?: string
  left?: ReactNode
  right?: ReactNode
  onBack?: () => void
  transparent?: boolean
  topInset?: number
}

const BackIcon = () => (
  // Simple chevron-left as an SVG-like path is not available in RN;
  // consuming app should pass a proper icon via the `left` prop.
  // This is a fallback text indicator.
  <Text style={{ fontSize: 20, color: theme.colors.textPrimary, lineHeight: 24 }}>{'‹'}</Text>
)

export function AppBar({ title, left, right, onBack, transparent = false, topInset = 0 }: AppBarProps) {
  return (
    <View
      style={[
        styles.container,
        { paddingTop: topInset },
        transparent && styles.transparent,
      ]}
    >
      <View style={styles.inner}>
        {/* Left slot */}
        <View style={styles.slot}>
          {left ?? (onBack && (
            <Pressable
              onPress={onBack}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="뒤로가기"
              hitSlop={8}
            >
              <BackIcon />
            </Pressable>
          ))}
        </View>

        {/* Title */}
        {title && (
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
        )}

        {/* Right slot */}
        <View style={[styles.slot, styles.rightSlot]}>
          {right}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderSubtle,
  },
  transparent: {
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: theme.spacing[4],
  },
  slot: {
    width: 72,
    alignItems: 'flex-start',
  },
  rightSlot: {
    alignItems: 'flex-end',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.typography.fontSize.subheading,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  iconButton: {
    padding: 4,
  },
})
