import { useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/src/components/action-button';
import { AppScreen } from '@/src/components/app-screen';
import { CapturedPhotoPreview } from '@/src/components/captured-photo-preview';
import { ScreenHeader } from '@/src/components/screen-header';
import { messages } from '@/src/i18n/messages';
import { CitizenReportSubmissionError, submitCitizenReport, type SubmissionStage } from '@/src/services/report-submission';
import { useCitizenReport } from '@/src/state/citizen-report-context';
import { colors, radii, spacing } from '@/src/theme/tokens';
import {
  formatReportAddress,
  formatReportCoordinates,
  hasValidReportLocation,
} from '@/src/utils/report-location';

export default function ReviewScreen() {
  const router = useRouter();
  const {
    draft,
    clearNearbyPotholeDecision,
    locale,
    setSubmissionAttempt,
    setSubmittedReport,
    submissionAttempt,
  } = useCitizenReport();
  const copy = messages[locale];
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStage, setSubmissionStage] = useState<SubmissionStage | null>(null);
  const [submissionError, setSubmissionError] = useState<
    'existingPotholeUnavailable' | 'generic' | 'photoInvalid' | 'photoTooLarge' | 'photoUpload' | null
  >(null);
  const isSubmittingRef = useRef(false);
  const severity = draft.severity ? copy.details.severity[draft.severity] : undefined;
  const note = draft.note.trim();
  const location = hasValidReportLocation(draft.location) ? draft.location : null;
  const coordinates = location ? formatReportCoordinates(location) : null;
  const formattedAddress = location ? formatReportAddress(location.address) : null;
  const accuracy =
    location && location.accuracy !== null
      ? location.source === 'adjusted'
        ? copy.location.originalGpsAccuracy(Math.round(location.accuracy))
        : copy.location.accuracy(Math.round(location.accuracy))
      : null;
  const canSubmit = Boolean(draft.photoUri && draft.severity && location);

  const submitReport = async () => {
    if (!canSubmit || isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const { attempt, report } = await submitCitizenReport({
        draft,
        existingAttempt: submissionAttempt,
        onAttemptReady: setSubmissionAttempt,
        onStage: setSubmissionStage,
      });

      setSubmissionAttempt(attempt);
      setSubmittedReport(report);
      router.replace('/report/success');
    } catch (error) {
      if (error instanceof CitizenReportSubmissionError) {
        setSubmissionAttempt(error.attempt);
        if (error.kind === 'existingPotholeUnavailable') {
          clearNearbyPotholeDecision();
        }
        setSubmissionError(
          error.kind === 'existingPotholeUnavailable'
            ? 'existingPotholeUnavailable'
            : error.kind === 'photoTooLarge'
            ? 'photoTooLarge'
            : error.kind === 'photoInvalid'
              ? 'photoInvalid'
              : error.kind === 'photoUpload'
                ? 'photoUpload'
              : 'generic',
        );
      } else {
        setSubmissionError('generic');
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setSubmissionStage(null);
    }
  };

  const progressMessage =
    submissionStage === 'preparing'
      ? copy.review.preparingReport
      : submissionStage === 'uploading'
        ? copy.review.uploadingPhoto
        : copy.review.savingReport;
  const errorCopy =
    submissionError === 'photoTooLarge'
      ? {
          title: copy.review.photoTooLargeTitle,
          description: copy.review.photoTooLargeDescription,
        }
      : submissionError === 'photoInvalid'
        ? {
            title: copy.review.photoInvalidTitle,
            description: copy.review.photoInvalidDescription,
          }
      : submissionError === 'existingPotholeUnavailable'
          ? {
              title: copy.review.existingPotholeUnavailableTitle,
              description: copy.review.existingPotholeUnavailableDescription,
            }
          : submissionError === 'photoUpload'
            ? {
                title: copy.review.photoUploadErrorTitle,
                description: copy.review.photoUploadErrorDescription,
              }
        : {
            title: copy.review.submissionErrorTitle,
            description: copy.review.submissionErrorDescription,
          };

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: !isSubmitting }} />

      <AppScreen contentStyle={styles.content}>
        <ScreenHeader backDisabled={isSubmitting} />

        <View style={styles.body}>
          <Text accessibilityRole="header" style={styles.title}>
            {copy.review.title}
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{copy.review.photo}</Text>
            {draft.photoUri ? (
              <CapturedPhotoPreview
                description={copy.photo.capturedPhotoDescription}
                label={copy.photo.capturedPhotoPreview}
                uri={draft.photoUri}
              />
            ) : (
              <View accessibilityRole="alert" style={styles.missingPhotoCard}>
                <Text style={styles.missingPhoto}>{copy.review.photoRequired}</Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{copy.review.location}</Text>
            {coordinates ? (
              <View style={styles.summaryCard}>
                {formattedAddress ? (
                  <>
                    <Text style={styles.summaryPrimary}>{formattedAddress.primary}</Text>
                    {formattedAddress.secondary ? (
                      <Text style={styles.summarySecondary}>{formattedAddress.secondary}</Text>
                    ) : null}
                    <Text style={styles.coordinates}>{coordinates}</Text>
                  </>
                ) : (
                  <Text style={styles.summaryPrimary}>{coordinates}</Text>
                )}
                {accuracy ? <Text style={styles.summarySecondary}>{accuracy}</Text> : null}
              </View>
            ) : (
              <View accessibilityRole="alert" style={styles.missingPhotoCard}>
                <Text style={styles.missingPhoto}>{copy.review.locationRequired}</Text>
              </View>
            )}
          </View>

          {draft.selectedExistingPothole ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{copy.review.addingToExistingPothole}</Text>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryPrimary}>{draft.selectedExistingPothole.publicId}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{copy.review.severity}</Text>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryPrimary}>{severity?.label}</Text>
              {severity ? <Text style={styles.summarySecondary}>{severity.description}</Text> : null}
            </View>
          </View>

          {note ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{copy.review.note}</Text>
              <View style={styles.summaryCard}>
                <Text style={styles.note}>{note}</Text>
              </View>
            </View>
          ) : null}

          {isSubmitting ? (
            <View accessibilityRole="progressbar" style={styles.progressCard}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.progressText}>{progressMessage}</Text>
            </View>
          ) : null}

          {submissionError ? (
            <View accessibilityRole="alert" style={styles.errorCard}>
              <Text style={styles.errorTitle}>{errorCopy.title}</Text>
              <Text style={styles.errorDescription}>{errorCopy.description}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            {submissionError === 'existingPotholeUnavailable' ? (
              <ActionButton
                label={copy.review.checkNearbyAgainAction}
                onPress={() => router.dismissTo('/report/location')}
              />
            ) : (
              <>
                <ActionButton
                  disabled={isSubmitting}
                  label={copy.common.edit}
                  onPress={() => router.back()}
                  variant="secondary"
                />
                <ActionButton
                  busy={isSubmitting}
                  disabled={!canSubmit}
                  label={
                    isSubmitting
                      ? copy.review.submittingAction
                      : submissionError
                        ? copy.review.retryAction
                        : copy.review.submitAction
                  }
                  onPress={submitReport}
                />
              </>
            )}
          </View>
        </View>
      </AppScreen>
    </>
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
  title: {
    color: colors.textPrimary,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.7,
    lineHeight: 36,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.xxs,
    padding: spacing.md,
  },
  summaryPrimary: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  summarySecondary: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  coordinates: {
    color: colors.textTertiary,
    fontSize: 13,
    lineHeight: 18,
  },
  note: {
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 24,
  },
  missingPhotoCard: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  missingPhoto: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  progressCard: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.card,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
  },
  progressText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  errorCard: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.card,
    gap: spacing.xxs,
    padding: spacing.md,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '800',
  },
  errorDescription: {
    color: colors.danger,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
