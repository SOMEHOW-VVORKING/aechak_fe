import type { ReactNode } from 'react'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export interface PhotoUploadProps {
  photos: string[]
  onAdd: () => void
  onRemove: (index: number) => void
  max?: number
  addIcon?: ReactNode
}

export function PhotoUpload({ photos, onAdd, onRemove, max = 5, addIcon }: PhotoUploadProps) {
  const canAdd = photos.length < max

  return (
    <View style={styles.row}>
      {canAdd && (
        <Pressable
          onPress={onAdd}
          style={styles.addTile}
          accessibilityRole="button"
          accessibilityLabel="사진 추가"
        >
          {addIcon ?? <Text style={styles.addIcon}>＋</Text>}
          <Text style={styles.count}>
            {photos.length}/{max}
          </Text>
        </Pressable>
      )}
      {photos.map((uri, index) => (
        <View key={`${uri}-${index}`} style={styles.tile}>
          <Image source={{ uri }} style={styles.image} />
          <Pressable
            onPress={() => onRemove(index)}
            style={styles.removeButton}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="사진 삭제"
          >
            <Text style={styles.removeLabel}>✕</Text>
          </Pressable>
        </View>
      ))}
    </View>
  )
}

const TILE_SIZE = 64

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing[2],
  },
  addTile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderDefault,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addIcon: {
    fontSize: 18,
    color: theme.colors.textTertiary,
  },
  count: {
    fontSize: theme.typography.fontSize.caption,
    color: theme.colors.textTertiary,
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radius.sm,
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceInverse,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeLabel: {
    fontSize: 10,
    color: theme.colors.white,
  },
})
