import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/src/theme/tokens';

type CapturedPhotoPreviewProps = {
  uri: string;
  label: string;
  description: string;
};

export function CapturedPhotoPreview({ uri, label, description }: CapturedPhotoPreviewProps) {
  return (
    <View accessibilityLabel={`${label}. ${description}`} accessibilityRole="image" style={styles.container}>
      <Image accessible={false} resizeMode="cover" source={{ uri }} style={styles.image} />
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.hero,
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: {
    height: 260,
    width: '100%',
  },
  copy: {
    gap: spacing.xxs,
    padding: spacing.md,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
});
