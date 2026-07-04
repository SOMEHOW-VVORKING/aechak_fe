import { useState } from 'react'
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { theme } from '../theme'

export interface RatingInputProps {
  value: number
  onChange?: (value: number) => void
  max?: number
  size?: number
  readonly?: boolean
}

function StarRow({ max, size, on }: { max: number; size: number; on: boolean }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: max }).map((_, i) => (
        <Text key={i} style={[styles.star, { fontSize: size }, on && styles.starOn]}>★</Text>
      ))}
    </View>
  )
}

export function RatingInput({ value, onChange, max = 5, size = 28, readonly }: RatingInputProps) {
  const [rowWidth, setRowWidth] = useState(0)
  const interactive = !readonly && !!onChange

  if (interactive) {
    return (
      <View style={styles.row} accessibilityRole="adjustable">
        {Array.from({ length: max }).map((_, i) => (
          <Pressable
            key={i}
            onPress={() => onChange(i + 1)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`${i + 1}점`}
          >
            <Text style={[styles.star, { fontSize: size }, i < value && styles.starOn]}>★</Text>
          </Pressable>
        ))}
      </View>
    )
  }

  const fillRatio = Math.max(0, Math.min(value, max)) / max
  const handleLayout = (e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width)

  return (
    <View style={styles.container}>
      <View onLayout={handleLayout}>
        <StarRow max={max} size={size} on={false} />
      </View>
      <View style={[styles.overlay, { width: rowWidth * fillRatio }]}>
        <StarRow max={max} size={size} on />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    gap: 4,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
  star: {
    color: theme.colors.borderDefault,
  },
  starOn: {
    color: theme.colors.warningSolid,
  },
})
