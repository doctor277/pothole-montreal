import { Pressable, StyleSheet, Text, View } from 'react-native';

import { messages, supportedLocales } from '@/src/i18n/messages';
import { useCitizenReport } from '@/src/state/citizen-report-context';
import { colors, layout, radii, spacing } from '@/src/theme/tokens';

export function LanguageToggle() {
  const { locale, setLocale } = useCitizenReport();
  const copy = messages[locale].common;

  return (
    <View accessibilityLabel={copy.languageControlAccessibilityLabel} accessibilityRole="radiogroup" style={styles.container}>
      {supportedLocales.map((language) => {
        const isSelected = language === locale;

        return (
          <LanguageOption
            accessibilityLabel={copy.languageAccessibilityLabels[language]}
            isSelected={isSelected}
            key={language}
            label={copy.languageLabels[language]}
            onPress={() => setLocale(language)}
          />
        );
      })}
    </View>
  );
}

type LanguageOptionProps = {
  accessibilityLabel: string;
  isSelected: boolean;
  label: string;
  onPress: () => void;
};

function LanguageOption({ accessibilityLabel, isSelected, label, onPress }: LanguageOptionProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        isSelected && styles.optionSelected,
        pressed && styles.optionPressed,
      ]}>
      <Text style={[styles.label, isSelected ? styles.labelSelected : styles.labelUnselected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: layout.minTouchTarget,
    padding: 0,
  },
  option: {
    alignItems: 'center',
    borderRadius: radii.pill,
    justifyContent: 'center',
    minHeight: layout.minTouchTarget,
    minWidth: layout.minTouchTarget,
    paddingHorizontal: spacing.xs,
  },
  optionSelected: {
    backgroundColor: colors.surface,
  },
  optionPressed: {
    backgroundColor: colors.brandSoft,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
  },
  labelSelected: {
    color: colors.brand,
  },
  labelUnselected: {
    color: colors.textSecondary,
  },
});
