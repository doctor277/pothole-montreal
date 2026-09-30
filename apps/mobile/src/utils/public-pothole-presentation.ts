import { colors } from '@/src/theme/tokens';
import type { PublicPotholeStatus } from '@/src/types/public-pothole';

type PublicPotholeStatusPresentation = {
  markerColor: string;
  pillBackgroundColor: string;
  pillTextColor: string;
};

// Statuses remain database-owned enum values. This only centralizes their
// citizen-map visual treatment.
export function getPublicPotholeStatusPresentation(
  status: PublicPotholeStatus,
): PublicPotholeStatusPresentation {
  switch (status) {
    case 'REPORTED':
    case 'UNDER_REVIEW':
    case 'VERIFIED':
      return {
        markerColor: colors.brand,
        pillBackgroundColor: colors.brandSoft,
        pillTextColor: colors.brandPressed,
      };
    case 'ASSIGNED':
    case 'ACCEPTED':
    case 'IN_PROGRESS':
      return {
        markerColor: colors.textSecondary,
        pillBackgroundColor: colors.surfaceSubtle,
        pillTextColor: colors.textSecondary,
      };
    case 'REPAIRED':
      return {
        markerColor: colors.success,
        pillBackgroundColor: colors.successSoft,
        pillTextColor: colors.success,
      };
    case 'REJECTED':
    case 'DUPLICATE':
      return {
        markerColor: colors.textTertiary,
        pillBackgroundColor: colors.surfaceSubtle,
        pillTextColor: colors.textSecondary,
      };
  }
}
