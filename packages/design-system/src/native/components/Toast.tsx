import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export type ToastVariant = 'error' | 'success' | 'info' | 'brand'

export interface ToastProps {
  message: string
  variant?: ToastVariant
  duration?: number
  onHide?: () => void
}

const accentColor: Record<ToastVariant, string> = {
  error:   theme.colors.errorFg,
  success: theme.colors.successFg,
  info:    theme.colors.infoFg,
  brand:   theme.colors.brand,
}

export function Toast({ message, variant = 'brand', duration = 3000, onHide }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const onHideRef = onHide
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(duration - 400),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onHideRef?.())
  }, [opacity, duration, onHide])

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={[styles.accent, { backgroundColor: accentColor[variant] }]} />
      <Text style={styles.message}>{message}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.borderSubtle,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8,
  },
  accent: {
    width: 3,
    alignSelf: 'stretch',
  },
  message: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: theme.typography.fontSize.bodySm,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
  },
})
