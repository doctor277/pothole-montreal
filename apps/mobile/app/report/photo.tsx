import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/src/components/action-button';
import { AppScreen } from '@/src/components/app-screen';
import { CameraCapture } from '@/src/components/camera-capture';
import { CapturedPhotoPreview } from '@/src/components/captured-photo-preview';
import { ScreenHeader } from '@/src/components/screen-header';
import { StepIndicator } from '@/src/components/step-indicator';
import { messages } from '@/src/i18n/messages';
import { useCitizenReport } from '@/src/state/citizen-report-context';
import { colors, spacing } from '@/src/theme/tokens';

export default function PhotoScreen() {
  const router = useRouter();
  const { clearCapturedPhoto, draft, locale, setCapturedPhoto } = useCitizenReport();
  const copy = messages[locale];

  return (
    <AppScreen contentStyle={styles.content}>
      <ScreenHeader />

      <View style={styles.body}>
        <StepIndicator current={1} label={copy.photo.step} total={3} />

        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            {copy.photo.title}
          </Text>
          <Text style={styles.description}>{copy.photo.description}</Text>
        </View>

        {draft.photoUri ? (
          <CapturedPhotoPreview
            description={copy.photo.capturedPhotoDescription}
            label={copy.photo.capturedPhotoPreview}
            uri={draft.photoUri}
          />
        ) : (
          <CameraCapture locale={locale} onCaptured={setCapturedPhoto} />
        )}

        {draft.photoUri ? (
          <View style={styles.actions}>
            <ActionButton
              accessibilityHint={copy.photo.retakePhotoAccessibilityHint}
              accessibilityLabel={copy.photo.retakePhotoAccessibilityLabel}
              label={copy.photo.retakePhoto}
              onPress={clearCapturedPhoto}
              variant="secondary"
            />
            <ActionButton
              accessibilityHint={copy.photo.continueWithPhotoAccessibilityHint}
              accessibilityLabel={copy.photo.continueWithPhotoAccessibilityLabel}
              label={copy.common.continue}
              onPress={() => router.push('/report/location')}
            />
          </View>
        ) : null}
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
    gap: spacing.xxl,
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
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
