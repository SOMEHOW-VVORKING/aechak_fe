import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Modal as RNModal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { theme } from '../theme'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm?: () => void
  confirmVariant?: 'primary' | 'danger'
  loading?: boolean
  children?: ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  description,
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  confirmVariant = 'primary',
  loading = false,
  children,
}: ModalProps) {
  return (
    <RNModal
      visible={open}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Pressable style={styles.scrim} onPress={onClose} />

        <View style={styles.panel}>
          <Text style={styles.title}>{title}</Text>
          {description && <Text style={styles.description}>{description}</Text>}
          {children && <View style={styles.body}>{children}</View>}

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={styles.cancelButton}
              accessibilityRole="button"
            >
              <Text style={styles.cancelLabel}>{cancelLabel}</Text>
            </Pressable>
            {onConfirm && (
              <Pressable
                onPress={loading ? undefined : onConfirm}
                disabled={loading}
                style={[
                  styles.confirmButton,
                  {
                    backgroundColor:
                      confirmVariant === 'danger' ? theme.colors.dangerFg : theme.colors.brand,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ busy: loading }}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={theme.colors.white} />
                ) : (
                  <Text style={styles.confirmLabel}>{confirmLabel}</Text>
                )}
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </RNModal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing[4],
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,26,23,0.48)',
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    borderRadius: theme.radius.modal,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing[6],
  },
  title: {
    fontSize: theme.typography.fontSize.subheading,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  description: {
    marginTop: theme.spacing[2],
    fontSize: theme.typography.fontSize.bodySm,
    color: theme.colors.textSecondary,
  },
  body: {
    marginTop: theme.spacing[4],
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing[2],
    marginTop: theme.spacing[6],
  },
  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: theme.radius.button,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    fontSize: theme.typography.fontSize.button,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  confirmButton: {
    flex: 1,
    height: 44,
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLabel: {
    fontSize: theme.typography.fontSize.button,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.white,
  },
})
