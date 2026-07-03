import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native'
import { theme } from '../theme'

interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  children: ReactNode
  maxHeight?: number
  showGrabber?: boolean
}

export function BottomSheet({
  visible,
  onClose,
  children,
  maxHeight,
  showGrabber = true,
}: BottomSheetProps) {
  const { height: screenHeight } = useWindowDimensions()
  // Stay mounted during close animation; unmount only after animation callback fires.
  const [mounted, setMounted] = useState(visible)
  const translateY = useRef(new Animated.Value(screenHeight)).current

  // Avoid stale closure in PanResponder (created once at mount, captures initial onClose)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (visible) {
      setMounted(true)
      Keyboard.dismiss()
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start()
    } else {
      Animated.timing(translateY, {
        toValue: screenHeight,
        duration: 240,
        useNativeDriver: true,
      }).start(() => setMounted(false))
    }
  }, [visible, translateY, screenHeight])

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => dy > 5,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) translateY.setValue(dy)
      },
      onPanResponderRelease: (_, { dy }) => {
        if (dy > 120) {
          onCloseRef.current()
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start()
        }
      },
    }),
  ).current

  if (!mounted) return null

  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      animationType="none"
      onRequestClose={() => onCloseRef.current()}
    >
      <View style={styles.container}>
        {/* Scrim */}
        <Pressable style={styles.scrim} onPress={() => onCloseRef.current()} />

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            { maxHeight: maxHeight ?? screenHeight * 0.9, transform: [{ translateY }] },
          ]}
          {...panResponder.panHandlers}
        >
          {showGrabber && (
            <View style={styles.grabberArea}>
              <View style={styles.grabber} />
            </View>
          )}
          {children}
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28,26,23,0.48)',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.bottomsheet,
    borderTopRightRadius: theme.radius.bottomsheet,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  grabberArea: {
    alignItems: 'center',
    paddingVertical: theme.spacing[2],
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderDefault,
  },
})
