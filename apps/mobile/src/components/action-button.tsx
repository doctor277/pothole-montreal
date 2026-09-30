import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radii, spacing } from '@/src/theme/tokens';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  busy?: boolean;
  showArrow?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  showArrow = false,
  accessibilityLabel,
  accessibilityHint,
}: ActionButtonProps) {
  const isPrimary = variant === 'primary';
  const isDisabled = disabled || busy;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={isDisabled ? { busy, disabled: true } : undefined}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        isDisabled && styles.disabled,
        pressed && !isDisabled && (isPrimary ? styles.primaryPressed : styles.secondaryPressed),
      ]}>
      <Text
        style={[
          styles.label,
          isDisabled ? styles.disabledLabel : isPrimary ? styles.primaryLabel : styles.secondaryLabel,
        ]}>
        {label}
      </Text>
      {showArrow ? (
        <View accessible={false} style={styles.arrowContainer}>
          <Text style={[styles.arrow, isPrimary ? styles.primaryLabel : styles.secondaryLabel]}>{'\u2192'}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radii.control,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: layout.minTouchTarget + spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  primary: {
    backgroundColor: colors.brand,
  },
  primaryPressed: {
    backgroundColor: colors.brandPressed,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  secondaryPressed: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.borderStrong,
  },
  disabled: {
    backgroundColor: colors.disabledSurface,
    borderColor: colors.disabledSurface,
  },
  label: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  primaryLabel: {
    color: colors.surface,
  },
  secondaryLabel: {
    color: colors.brand,
  },
  disabledLabel: {
    color: colors.disabledText,
  },
  arrowContainer: {
    marginLeft: spacing.sm,
  },
  arrow: {
    fontSize: 22,
    lineHeight: 24,
  },
});
