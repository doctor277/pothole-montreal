import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LanguageToggle } from '@/src/components/language-toggle';
import { messages } from '@/src/i18n/messages';
import { useCitizenReport } from '@/src/state/citizen-report-context';
import { colors, layout, spacing } from '@/src/theme/tokens';

type ScreenHeaderProps = {
  showBack?: boolean;
  backDisabled?: boolean;
};

export function ScreenHeader({ showBack = true, backDisabled = false }: ScreenHeaderProps) {
  const router = useRouter();
  const { locale } = useCitizenReport();
  const copy = messages[locale].common;

  return (
    <View style={styles.container}>
      {showBack ? (
        <Pressable
          accessibilityLabel={copy.backAccessibilityLabel}
          accessibilityRole="button"
          accessibilityState={backDisabled ? { disabled: true } : undefined}
          disabled={backDisabled}
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            backDisabled && styles.backButtonDisabled,
            pressed && !backDisabled && styles.backButtonPressed,
          ]}>
          <Text accessible={false} style={styles.backIcon}>
            {'\u2039'}
          </Text>
          <Text style={styles.backLabel}>{copy.back}</Text>
        </Pressable>
      ) : (
        <View style={styles.spacer} />
      )}
      <LanguageToggle />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    minHeight: layout.minTouchTarget,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: layout.minTouchTarget / 2,
    flexDirection: 'row',
    minHeight: layout.minTouchTarget,
    paddingRight: spacing.sm,
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  backButtonDisabled: {
    opacity: 0.45,
  },
  backIcon: {
    color: colors.textPrimary,
    fontSize: 34,
    lineHeight: 34,
    marginRight: spacing.xxs,
  },
  backLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  spacer: {
    minWidth: layout.minTouchTarget,
  },
});
