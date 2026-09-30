import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/src/components/action-button';
import { AppScreen } from '@/src/components/app-screen';
import { ScreenHeader } from '@/src/components/screen-header';
import { messages } from '@/src/i18n/messages';
import { useCitizenReport } from '@/src/state/citizen-report-context';
import { colors, radii, spacing } from '@/src/theme/tokens';

export default function SuccessScreen() {
  const router = useRouter();
  const { locale, resetReport, submittedReport } = useCitizenReport();
  const copy = messages[locale];

  if (!submittedReport) {
    return <Redirect href="/" />;
  }

  const finishReport = () => {
    resetReport();
    router.dismissAll();
  };

  return (
    <AppScreen contentStyle={styles.content}>
      <ScreenHeader showBack={false} />

      <View style={styles.body}>
        <View style={styles.successIcon} accessible={false}>
          <Text style={styles.successIconLabel}>{'\u2713'}</Text>
        </View>

        <View style={styles.copy}>
          <Text accessibilityRole="header" style={styles.title}>
            {copy.success.title}
          </Text>
          <Text style={styles.description}>
            {submittedReport.matchedExisting
              ? copy.success.existingPotholeDescription
              : copy.success.description}
          </Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.reference}>{copy.success.reference(submittedReport.publicId)}</Text>
          {submittedReport.matchedExisting ? (
            <Text style={styles.reportCount}>{copy.success.reportCount(submittedReport.reportCount)}</Text>
          ) : null}
          <View style={styles.statusGroup}>
            <Text style={styles.statusLabel}>{copy.success.statusLabel}</Text>
            <View style={styles.statusRow}>
              <View accessible={false} style={styles.statusDot} />
              <Text style={styles.statusValue}>{copy.submissionStatuses[submittedReport.status]}</Text>
            </View>
          </View>
          <Text style={styles.statusDescription}>{copy.success.statusDescription}</Text>
        </View>

        <View style={styles.actions}>
          <ActionButton
            label={copy.success.viewReportAction}
            onPress={() => router.push('/report/status')}
            variant="secondary"
          />
          <ActionButton label={copy.common.done} onPress={finishReport} />
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  body: {
    alignItems: 'stretch',
    flex: 1,
    gap: spacing.xl,
    justifyContent: 'center',
    paddingBottom: spacing.section,
  },
  successIcon: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.successSoft,
    borderRadius: radii.pill,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  successIconLabel: {
    color: colors.success,
    fontSize: 38,
    fontWeight: '800',
  },
  copy: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 38,
    textAlign: 'center',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  reference: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  reportCount: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
  statusGroup: {
    gap: spacing.xs,
  },
  statusLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statusDot: {
    backgroundColor: colors.brand,
    borderRadius: radii.pill,
    height: 10,
    width: 10,
  },
  statusValue: {
    color: colors.brand,
    fontSize: 17,
    fontWeight: '800',
  },
  statusDescription: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    gap: spacing.sm,
  },
});
