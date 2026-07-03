import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: { label: string; onPress: () => void }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {action && (
        <Pressable
          onPress={action.onPress}
          style={styles.button}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing[10],
    paddingHorizontal: theme.spacing[6],
    gap: theme.spacing[2],
  },
  icon: {
    marginBottom: theme.spacing[2],
    opacity: 0.4,
  },
  title: {
    fontSize: theme.typography.fontSize.subheading,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  description: {
    fontSize: theme.typography.fontSize.bodySm,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: 4,
  },
  button: {
    marginTop: theme.spacing[4],
    height: 44,
    paddingHorizontal: theme.spacing[6],
    borderRadius: theme.radius.button,
    backgroundColor: theme.colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: theme.typography.fontSize.button,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.onBrand,
  },
})
