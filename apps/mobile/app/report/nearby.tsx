import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/src/components/action-button';
import { AppScreen } from '@/src/components/app-screen';
import { ScreenHeader } from '@/src/components/screen-header';
import { messages } from '@/src/i18n/messages';
import { useCitizenReport } from '@/src/state/citizen-report-context';
import { colors, radii, spacing } from '@/src/theme/tokens';
import type { NearbyPotholeCandidate } from '@/src/types/nearby-pothole';
import { hasValidReportLocation } from '@/src/utils/report-location';

function formatRoundedDistance(distanceMeters: number): number {
  return Math.max(0, Math.round(distanceMeters));
}

export default function NearbyPotholesScreen() {
  const router = useRouter();
  const { chooseNewPothole, draft, locale, selectExistingPothole } = useCitizenReport();
  const copy = messages[locale];
  const candidates = draft.nearbyCandidates;

  if (!hasValidReportLocation(draft.location) || !candidates || candidates.length === 0) {
    return <Redirect href="/report/location" />;
  }

  const chooseExistingPothole = (candidate: NearbyPotholeCandidate) => {
    selectExistingPothole(candidate);
    router.replace('/report/details');
  };

  const chooseNewPotholeAndContinue = () => {
    chooseNewPothole();
    router.replace('/report/details');
  };

  return (
    <AppScreen contentStyle={styles.content}>
      <ScreenHeader />

      <View style={styles.body}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            {copy.nearby.title}
          </Text>
          <Text style={styles.description}>{copy.nearby.description}</Text>
        </View>

        <View style={styles.candidates}>
          {candidates.map((candidate) => (
            <View key={candidate.publicId} style={styles.candidateCard}>
              <View style={styles.candidateHeading}>
                <Text style={styles.publicId}>{candidate.publicId}</Text>
                <Text style={styles.distance}>
                  {copy.nearby.distance(formatRoundedDistance(candidate.distanceMeters))}
                </Text>
              </View>

              <Text style={styles.address}>
                {candidate.formattedAddress ?? copy.map.addressUnavailable}
              </Text>

              <View style={styles.metadata}>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>{copy.map.statusLabel}</Text>
                  <Text style={styles.metadataValue}>{copy.submissionStatuses[candidate.status]}</Text>
                </View>
                <View style={styles.metadataRow}>
                  <Text style={styles.metadataLabel}>{copy.map.reportCount(candidate.reportCount)}</Text>
                </View>
                {candidate.latestSeverity ? (
                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataLabel}>{copy.map.severityLabel}</Text>
                    <Text style={styles.metadataValue}>{copy.map.severity[candidate.latestSeverity]}</Text>
                  </View>
                ) : null}
              </View>

              <ActionButton
                label={copy.nearby.samePotholeAction}
                onPress={() => chooseExistingPothole(candidate)}
                variant="secondary"
              />
            </View>
          ))}
        </View>

        <ActionButton label={copy.nearby.noneOfTheseAction} onPress={chooseNewPotholeAndContinue} />
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
  candidates: {
    gap: spacing.md,
  },
  candidateCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  candidateHeading: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  publicId: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  distance: {
    color: colors.brand,
    fontSize: 15,
    fontWeight: '800',
  },
  address: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  metadata: {
    gap: spacing.xs,
  },
  metadataRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metadataLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  metadataValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
