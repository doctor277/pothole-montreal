import { useRouter } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionButton } from '@/src/components/action-button';
import { AppScreen } from '@/src/components/app-screen';
import { ScreenHeader } from '@/src/components/screen-header';
import { SeverityOption } from '@/src/components/severity-option';
import { StepIndicator } from '@/src/components/step-indicator';
import { messages } from '@/src/i18n/messages';
import { useCitizenReport } from '@/src/state/citizen-report-context';
import { colors, radii, spacing } from '@/src/theme/tokens';
import { severityIds } from '@/src/types/report';

export default function DetailsScreen() {
  const router = useRouter();
  const { draft, locale, setNote, setSeverity } = useCitizenReport();
  const copy = messages[locale];

  return (
    <AppScreen contentStyle={styles.content} keyboardAware>
      <ScreenHeader />

      <View style={styles.body}>
        <StepIndicator current={3} label={copy.details.step} total={3} />

        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            {copy.details.title}
          </Text>
          <Text style={styles.description}>{copy.details.description}</Text>
        </View>

        <View accessibilityRole="radiogroup" style={styles.options}>
          {severityIds.map((severity) => {
            const option = copy.details.severity[severity];

            return (
              <SeverityOption
                accessibilityLabel={`${option.label}. ${option.description}`}
                description={option.description}
                key={severity}
                label={option.label}
                onPress={() => setSeverity(severity)}
                selected={draft.severity === severity}
              />
            );
          })}
        </View>

        <View style={styles.noteSection}>
          <Text style={styles.noteLabel}>{copy.details.optionalNote}</Text>
          <TextInput
            accessibilityLabel={copy.details.optionalNote}
            maxLength={500}
            multiline
            onChangeText={setNote}
            placeholder={copy.details.notePlaceholder}
            placeholderTextColor={colors.textTertiary}
            style={styles.noteInput}
            textAlignVertical="top"
            value={draft.note}
          />
        </View>

        <ActionButton
          disabled={!draft.severity}
          label={copy.details.reviewAction}
          onPress={() => router.push('/report/review')}
        />
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
  options: {
    gap: spacing.sm,
  },
  noteSection: {
    gap: spacing.xs,
  },
  noteLabel: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  noteInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 16,
    lineHeight: 23,
    minHeight: 128,
    padding: spacing.md,
  },
});
