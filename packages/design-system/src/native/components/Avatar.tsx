import { Image, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

export interface AvatarProps {
  src?: string
  name?: string
  size?: AvatarSize
}

const sizeMap: Record<AvatarSize, { container: number; text: number }> = {
  sm: { container: 24, text: theme.typography.fontSize.badge },
  md: { container: 32, text: theme.typography.fontSize.caption },
  lg: { container: 40, text: theme.typography.fontSize.bodySm },
  xl: { container: 56, text: theme.typography.fontSize.body },
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function Avatar({ src, name, size = 'md' }: AvatarProps) {
  const s = sizeMap[size]
  return (
    <View
      style={[
        styles.base,
        { width: s.container, height: s.container, borderRadius: s.container / 2 },
      ]}
      accessibilityLabel={name}
    >
      {src ? (
        <Image source={{ uri: src }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : name ? (
        <Text style={[styles.initials, { fontSize: s.text }]}>{getInitials(name)}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: theme.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  initials: {
    fontWeight: '600',
    color: theme.colors.textTertiary,
  },
})
