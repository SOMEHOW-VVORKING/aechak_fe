import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, type ViewStyle } from 'react-native'

type SkeletonRadius = 'sm' | 'md' | 'full'

export interface SkeletonProps {
  width?: number | `${number}%`
  height?: number
  radius?: SkeletonRadius
  style?: ViewStyle
}

const radiusMap: Record<SkeletonRadius, number> = {
  sm: 4,
  md: 8,
  full: 9999,
}

export function Skeleton({ width = '100%', height = 16, radius = 'md', style }: SkeletonProps) {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [anim])

  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.8] })

  return (
    <Animated.View
      style={[
        styles.base,
        { width: width as number, height, borderRadius: radiusMap[radius], opacity },
        style,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#E9E5DF',
  },
})
