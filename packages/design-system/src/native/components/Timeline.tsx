import { StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

type StepStatus = 'done' | 'active' | 'todo'

export interface TimelineStep {
  label: string
  sublabel?: string
  status: StepStatus
}

export interface TimelineProps {
  steps: TimelineStep[]
}

const dotColor: Record<StepStatus, string> = {
  done:   theme.colors.successFg,
  active: theme.colors.brand,
  todo:   theme.colors.borderDefault,
}

const lineColor: Record<StepStatus, string> = {
  done:   theme.colors.successFg,
  active: theme.colors.borderSubtle,
  todo:   theme.colors.borderSubtle,
}

export function Timeline({ steps }: TimelineProps) {
  return (
    <View style={styles.container}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        return (
          <View key={i} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: dotColor[step.status] }]} />
              {!isLast && (
                <View style={[styles.line, { backgroundColor: lineColor[step.status] }]} />
              )}
            </View>
            <View style={[styles.content, isLast && styles.contentLast]}>
              <Text
                style={[
                  styles.label,
                  step.status === 'active' && styles.labelActive,
                  step.status === 'todo' && styles.labelTodo,
                ]}
              >
                {step.label}
              </Text>
              {step.sublabel && (
                <Text style={styles.sublabel}>{step.sublabel}</Text>
              )}
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  row: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 12 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  line: { width: 2, flex: 1, minHeight: 18, marginTop: 2 },
  content: { flex: 1, paddingBottom: 20 },
  contentLast: { paddingBottom: 0 },
  label: {
    fontSize: theme.typography.fontSize.bodySm,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textPrimary,
  },
  labelActive: {
    color: theme.colors.brand,
  },
  labelTodo: {
    color: theme.colors.textTertiary,
    fontWeight: theme.typography.fontWeight.regular,
  },
  sublabel: {
    fontSize: theme.typography.fontSize.caption,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
})
