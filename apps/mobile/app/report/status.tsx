import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/src/components/action-button';
import { AppScreen } from '@/src/components/app-screen';
import { ScreenHeader } from '@/src/components/screen-header';
import { messages } from '@/src/i18n/messages';
import { useCitizenReport } from '@/src/state/citizen-report-context';
import { colors, radii, spacing } from '@/src/theme/tokens';

export default function ReportStatusScreen() {
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
      <ScreenHeader />

      <View style={styles.body}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            {copy.reportStatus.title}
          </Text>
          <Text style={styles.description}>
            {submittedReport.matchedExisting
              ? copy.reportStatus.existingPotholeDescription
              : copy.reportStatus.description}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.reference}>{copy.success.reference(submittedReport.publicId)}</Text>
          <View style={styles.divider} />
          <View style={styles.detailGroup}>
            <Text style={styles.detailLabel}>
              {submittedReport.matchedExisting
                ? copy.reportStatus.existingPotholeStatusLabel
                : copy.reportStatus.receivedLabel}
            </Text>
            <View style={styles.statusRow}>
              <View accessible={false} style={styles.statusDot} />
              <Text style={styles.statusValue}>{copy.submissionStatuses[submittedReport.status]}</Text>
            </View>
          </View>
        </View>

        <ActionButton label={copy.common.done} onPress={finishReport} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  body: {
    flex: 1,
    gap: spacing.xl,
  },
  heading: {
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.7,
    lineHeight: 36,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  reference: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  divider: {
    backgroundColor: colors.border,
    height: 1,
  },
  detailGroup: {
    gap: spacing.xs,
  },
  detailLabel: {
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
});
