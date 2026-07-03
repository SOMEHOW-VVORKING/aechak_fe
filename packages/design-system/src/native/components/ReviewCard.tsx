import { Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

export interface ReviewCardProps {
  author: string
  rating: 1 | 2 | 3 | 4 | 5
  date: string
  content: string
  images?: string[]
}

function Stars({ rating }: { rating: number }) {
  return (
    <View style={styles.stars}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={[styles.star, i < rating && styles.starOn]}>★</Text>
      ))}
    </View>
  )
}

export function ReviewCard({ author, rating, date, content, images }: ReviewCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Stars rating={rating} />
        <Text style={styles.date}>{date}</Text>
      </View>
      <Text style={styles.author}>{author}</Text>
      <Text style={styles.content}>{content}</Text>
      {images && images.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.images}
          contentContainerStyle={styles.imagesContent}
        >
          {images.map((uri, i) => (
            <Image key={i} source={{ uri }} style={styles.image} />
          ))}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.card,
    padding: 14,
    gap: theme.spacing[2],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stars: {
    flexDirection: 'row',
    gap: 1,
  },
  star: {
    fontSize: 14,
    color: theme.colors.borderDefault,
  },
  starOn: {
    color: '#CE9618',
  },
  date: {
    fontSize: theme.typography.fontSize.caption,
    color: theme.colors.textTertiary,
  },
  author: {
    fontSize: theme.typography.fontSize.label,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
  },
  content: {
    fontSize: theme.typography.fontSize.bodySm,
    color: theme.colors.textPrimary,
    lineHeight: 20,
  },
  images: {
    marginTop: 4,
  },
  imagesContent: {
    gap: 6,
  },
  image: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.sm,
  },
})
