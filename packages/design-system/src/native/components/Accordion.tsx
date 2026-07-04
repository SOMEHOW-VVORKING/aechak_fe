import type { ReactNode } from 'react'
import { useState } from 'react'
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native'
import { theme } from '../theme'

export interface AccordionProps {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onToggle?: (open: boolean) => void
}

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

export function Accordion({ title, children, defaultOpen = false, open, onToggle }: AccordionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isOpen = open ?? internalOpen

  const handleToggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    if (open === undefined) setInternalOpen(!isOpen)
    onToggle?.(!isOpen)
  }

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handleToggle}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>⌄</Text>
      </Pressable>
      {isOpen && <View style={styles.body}>{children}</View>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing[4],
  },
  title: {
    fontSize: theme.typography.fontSize.body,
    fontWeight: theme.typography.fontWeight.medium,
    color: theme.colors.textPrimary,
  },
  chevron: {
    fontSize: 16,
    color: theme.colors.textTertiary,
    transform: [{ rotate: '-90deg' }],
  },
  chevronOpen: {
    transform: [{ rotate: '0deg' }],
  },
  body: {
    paddingBottom: theme.spacing[4],
  },
})
