import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export type AlertVariant = 'info' | 'warning' | 'error' | 'danger'

export interface AlertProps {
  variant?: AlertVariant
  title?: string
  message: string
  onDismiss?: () => void
}

const variantColors: Record<AlertVariant, { surface: string; border: string; fg: string }> = {
  info:    { surface: theme.colors.infoSurface,    border: '#A1C1ED', fg: theme.colors.infoFg },
  warning: { surface: theme.colors.warningSurface, border: '#EFCD79', fg: theme.colors.warningFg },
  error:   { surface: theme.colors.errorSurface,   border: '#F0A69E', fg: theme.colors.errorFg },
  danger:  { surface: theme.colors.dangerSurface,  border: '#E5746A', fg: theme.colors.dangerFg },
}

const variantIcon: Record<AlertVariant, string> = {
  info: 'ℹ', warning: '⚠', error: '✕', danger: '⚠',
}

export function Alert({ variant = 'info', title, message, onDismiss }: AlertProps) {
  const c = variantColors[variant]

  return (
    <View style={[styles.container, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[styles.icon, { color: c.fg }]}>{variantIcon[variant]}</Text>
      <View style={styles.body}>
        {title && <Text style={[styles.title, { color: c.fg }]}>{title}</Text>}
        <Text style={[styles.message, { color: c.fg }]}>{message}</Text>
      </View>
      {onDismiss && (
        <Pressable
          onPress={onDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="닫기"
        >
          <Text style={[styles.dismiss, { color: c.fg }]}>✕</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.radius.md,
    borderWidth: 1,
  },
  icon: {
    fontSize: 16,
    lineHeight: 22,
    marginTop: 1,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: theme.typography.fontSize.label,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  message: {
    fontSize: theme.typography.fontSize.bodySm,
  },
  dismiss: {
    fontSize: 14,
    lineHeight: 22,
    padding: 2,
  },
})
