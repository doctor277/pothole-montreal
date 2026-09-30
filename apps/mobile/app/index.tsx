import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/src/components/action-button';
import { AppScreen } from '@/src/components/app-screen';
import { ScreenHeader } from '@/src/components/screen-header';
import { messages } from '@/src/i18n/messages';
import { useCitizenReport } from '@/src/state/citizen-report-context';
import { colors, spacing } from '@/src/theme/tokens';

export default function HomeScreen() {
  const router = useRouter();
  const { locale, resetReport } = useCitizenReport();
  const copy = messages[locale].home;

  return (
    <AppScreen contentStyle={styles.content}>
      <ScreenHeader showBack={false} />

      <View style={styles.hero}>
        <Text style={styles.appName}>{copy.appName}</Text>
        <View style={styles.heroCopy}>
          <Text accessibilityRole="header" style={styles.headline}>
            {copy.headline}
          </Text>
          <Text style={styles.communityMessage}>{copy.communityMessage}</Text>
          <Text style={styles.speedMessage}>{copy.speedMessage}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <ActionButton
          label={copy.reportAction}
          onPress={() => {
            resetReport();
            router.push('/report/photo');
          }}
          showArrow
        />
        <ActionButton
          label={copy.mapAction}
          onPress={() => router.push('/map')}
          showArrow
          variant="secondary"
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.section,
  },
  hero: {
    gap: spacing.xl,
  },
  appName: {
    color: colors.brand,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  heroCopy: {
    gap: spacing.sm,
  },
  headline: {
    color: colors.textPrimary,
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1.25,
    lineHeight: 48,
  },
  communityMessage: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 28,
  },
  speedMessage: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  actions: {
    gap: spacing.sm,
  },
});
