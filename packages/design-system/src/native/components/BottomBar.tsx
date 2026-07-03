import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

interface PrimaryAction {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
}

interface SecondaryAction {
  label: string
  onPress: () => void
  icon?: ReactNode
}

interface BottomBarProps {
  primary: PrimaryAction
  secondary?: SecondaryAction
  iconActions?: ReactNode[]
  bottomInset?: number
}

export function BottomBar({ primary, secondary, iconActions, bottomInset = 0 }: BottomBarProps) {
  return (
    <View style={[styles.container, { paddingBottom: bottomInset + 12 }]}>
      {iconActions && (
        <View style={styles.iconRow}>
          {iconActions.map((icon, i) => (
            <View key={i} style={styles.iconSlot}>{icon}</View>
          ))}
        </View>
      )}
      <View style={styles.row}>
        {secondary && (
          <Pressable
            onPress={secondary.onPress}
            style={styles.secondaryBtn}
            accessibilityRole="button"
          >
            {secondary.icon && <View style={styles.secondaryIcon}>{secondary.icon}</View>}
            <Text style={styles.secondaryLabel}>{secondary.label}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={primary.onPress}
          disabled={primary.disabled || primary.loading}
          style={[
            styles.primaryBtn,
            secondary ? styles.primaryFlex : styles.primaryFull,
            (primary.disabled || primary.loading) && styles.primaryDisabled,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryLabel}>{primary.label}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderSubtle,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[3],
    gap: theme.spacing[3],
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing[2],
  },
  iconRow: {
    flexDirection: 'row',
    gap: theme.spacing[2],
  },
  iconSlot: {
    flex: 1,
    alignItems: 'center',
  },
  primaryBtn: {
    height: 48,
    borderRadius: theme.radius.button,
    backgroundColor: theme.colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryFlex: { flex: 1 },
  primaryFull: { flex: 1 },
  primaryDisabled: {
    backgroundColor: theme.colors.surfaceDisabled,
  },
  primaryLabel: {
    fontSize: theme.typography.fontSize.button,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.onBrand,
  },
  secondaryBtn: {
    height: 48,
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing[2],
  },
  secondaryIcon: {},
  secondaryLabel: {
    fontSize: theme.typography.fontSize.button,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
})
