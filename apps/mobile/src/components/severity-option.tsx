import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radii, spacing } from '@/src/theme/tokens';

type SeverityOptionProps = {
  accessibilityLabel: string;
  description: string;
  label: string;
  onPress: () => void;
  selected: boolean;
};

export function SeverityOption({
  accessibilityLabel,
  description,
  label,
  onPress,
  selected,
}: SeverityOptionProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && styles.optionPressed,
      ]}>
      <View accessible={false} style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {selected ? (
        <Text accessible={false} style={styles.checkmark}>
          {'\u2713'}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 96,
    padding: spacing.md,
  },
  optionSelected: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  optionPressed: {
    borderColor: colors.brand,
  },
  radio: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    borderWidth: 2,
    height: layout.minTouchTarget / 2,
    justifyContent: 'center',
    width: layout.minTouchTarget / 2,
  },
  radioSelected: {
    borderColor: colors.brand,
  },
  radioInner: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    height: 12,
    width: 12,
  },
  copy: {
    flex: 1,
    gap: spacing.xxs,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  checkmark: {
    color: colors.brand,
    fontSize: 20,
    fontWeight: '800',
  },
});
