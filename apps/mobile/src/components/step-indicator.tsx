import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/src/theme/tokens';

type StepIndicatorProps = {
  current: number;
  label: string;
  total: number;
};

export function StepIndicator({ current, label, total }: StepIndicatorProps) {
  return (
    <View accessibilityLabel={label} style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View accessible={false} style={styles.track}>
        {Array.from({ length: total }, (_, index) => (
          <View
            key={index}
            style={[styles.segment, index < current ? styles.segmentComplete : styles.segmentPending]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    color: colors.brand,
    fontSize: 14,
    fontWeight: '800',
  },
  track: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segment: {
    borderRadius: radii.pill,
    flex: 1,
    height: 4,
  },
  segmentComplete: {
    backgroundColor: colors.brand,
  },
  segmentPending: {
    backgroundColor: colors.border,
  },
});
