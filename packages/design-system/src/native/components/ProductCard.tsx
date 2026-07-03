import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export interface ProductCardProps {
  image: string
  name: string
  price: number
  originalPrice?: number
  storeName?: string
  isSold?: boolean
  onPress?: () => void
}

function formatPrice(n: number): string {
  return n.toLocaleString('ko-KR') + '원'
}

export function ProductCard({ image, name, price, originalPrice, storeName, isSold, onPress }: ProductCardProps) {
  const discount =
    originalPrice != null && originalPrice > price
      ? Math.round((1 - price / originalPrice) * 100)
      : null

  return (
    <Pressable onPress={onPress} style={styles.container} accessibilityRole="button">
      <View style={[styles.thumb, isSold && styles.thumbSold]}>
        <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
        {isSold && (
          <View style={styles.soldOverlay}>
            <Text style={styles.soldText}>품절</Text>
          </View>
        )}
      </View>
      {storeName && (
        <Text style={styles.store} numberOfLines={1}>{storeName}</Text>
      )}
      <Text style={styles.name} numberOfLines={2}>{name}</Text>
      <View style={styles.priceRow}>
        {discount != null && (
          <Text style={styles.discount}>{discount}%</Text>
        )}
        <Text style={styles.price}>{formatPrice(price)}</Text>
      </View>
      {originalPrice != null && originalPrice > price && (
        <Text style={styles.originalPrice}>{formatPrice(originalPrice)}</Text>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.image,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSunken,
    marginBottom: 8,
  },
  thumbSold: {
    opacity: 0.5,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  soldOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,26,23,0.4)',
  },
  soldText: {
    color: '#FFFFFF',
    fontSize: theme.typography.fontSize.label,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  store: {
    fontSize: theme.typography.fontSize.caption,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  name: {
    fontSize: theme.typography.fontSize.bodySm,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  discount: {
    fontSize: theme.typography.fontSize.label,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.accent,
  },
  price: {
    fontSize: theme.typography.fontSize.label,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  originalPrice: {
    fontSize: theme.typography.fontSize.caption,
    color: theme.colors.textTertiary,
    textDecorationLine: 'line-through',
    marginTop: 1,
  },
})
