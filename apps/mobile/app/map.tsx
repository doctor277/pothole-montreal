import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { AppScreen } from '@/src/components/app-screen';
import { ScreenHeader } from '@/src/components/screen-header';
import { messages } from '@/src/i18n/messages';
import { listPublicPotholesInBounds } from '@/src/services/public-potholes';
import { useCitizenReport } from '@/src/state/citizen-report-context';
import { colors, radii, spacing } from '@/src/theme/tokens';
import type { PublicPothole, PublicPotholeBounds } from '@/src/types/public-pothole';
import { getPublicPotholeStatusPresentation } from '@/src/utils/public-pothole-presentation';

const montrealFallbackRegion: Region = {
  latitude: 45.5019,
  longitude: -73.5674,
  latitudeDelta: 0.09,
  longitudeDelta: 0.06,
};

const mapRequestDebounceMs = 450;

export default function MapScreen() {
  const { locale } = useCitizenReport();
  const copy = messages[locale];
  const [potholes, setPotholes] = useState<readonly PublicPothole[]>([]);
  const [selectedPublicId, setSelectedPublicId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [resultLimitReached, setResultLimitReached] = useState(false);
  const latestRegionRef = useRef<Region>(montrealFallbackRegion);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSequenceRef = useRef(0);

  const selectedPothole = useMemo(
    () => potholes.find((pothole) => pothole.publicId === selectedPublicId) ?? null,
    [potholes, selectedPublicId],
  );

  const loadPotholes = useCallback(async (region: Region, sequence: number) => {
    const bounds = regionToBounds(region);

    if (!bounds) {
      if (sequence === requestSequenceRef.current) {
        setHasLoadError(true);
        setIsLoading(false);
      }

      return;
    }

    if (sequence === requestSequenceRef.current) {
      setIsLoading(true);
      setHasLoadError(false);
    }

    try {
      const result = await listPublicPotholesInBounds(bounds);

      if (sequence !== requestSequenceRef.current) {
        return;
      }

      setHasLoaded(true);
      setPotholes(result.potholes);
      setResultLimitReached(result.resultLimitReached);
      setSelectedPublicId((currentPublicId) =>
        result.potholes.some((pothole) => pothole.publicId === currentPublicId)
          ? currentPublicId
          : null,
      );
    } catch {
      if (sequence === requestSequenceRef.current) {
        setHasLoadError(true);
      }
    } finally {
      if (sequence === requestSequenceRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const schedulePotholeLoad = useCallback(
    (region: Region, delayMs = mapRequestDebounceMs) => {
      latestRegionRef.current = region;
      const sequence = ++requestSequenceRef.current;

      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current);
      }

      loadTimerRef.current = setTimeout(() => {
        loadTimerRef.current = null;
        void loadPotholes(region, sequence);
      }, delayMs);
    },
    [loadPotholes],
  );

  useEffect(() => {
    schedulePotholeLoad(montrealFallbackRegion, 0);

    return () => {
      requestSequenceRef.current += 1;

      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current);
      }
    };
  }, [schedulePotholeLoad]);

  const retryLoad = useCallback(() => {
    schedulePotholeLoad(latestRegionRef.current, 0);
  }, [schedulePotholeLoad]);

  const isInitialLoading = !hasLoaded && isLoading;
  const isRefreshing = hasLoaded && isLoading;

  return (
    <AppScreen contentStyle={styles.content}>
      <ScreenHeader />

      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>
          {copy.map.title}
        </Text>
        <Text style={styles.description}>{copy.map.description}</Text>
      </View>

      <View style={styles.mapContainer}>
        <MapView
          accessibilityHint={copy.map.mapAccessibilityHint}
          accessibilityLabel={copy.map.mapAccessibilityLabel}
          initialRegion={montrealFallbackRegion}
          loadingEnabled
          mapType="standard"
          onRegionChangeComplete={(region) => schedulePotholeLoad(region)}
          style={styles.map}>
          {potholes.map((pothole) => {
            const presentation = getPublicPotholeStatusPresentation(pothole.status);
            const statusLabel = copy.submissionStatuses[pothole.status];

            return (
              <Marker
                key={pothole.publicId}
                accessibilityLabel={copy.map.markerAccessibilityLabel(pothole.publicId, statusLabel)}
                coordinate={{ latitude: pothole.latitude, longitude: pothole.longitude }}
                description={pothole.formattedAddress ?? undefined}
                onPress={() => setSelectedPublicId(pothole.publicId)}
                pinColor={presentation.markerColor}
                title={copy.map.potholeTitle(pothole.publicId)}
              />
            );
          })}
        </MapView>

        {isInitialLoading ? (
          <View accessibilityRole="progressbar" style={styles.initialLoadingOverlay}>
            <ActivityIndicator color={colors.brand} size="small" />
            <Text style={styles.initialLoadingText}>{copy.map.loading}</Text>
          </View>
        ) : null}

        {isRefreshing ? (
          <View accessibilityRole="progressbar" style={styles.refreshingIndicator}>
            <ActivityIndicator color={colors.brand} size="small" />
            <Text style={styles.refreshingText}>{copy.map.refreshing}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.notices}>
        {resultLimitReached ? (
          <View style={styles.limitNotice}>
            <Text style={styles.noticeText}>{copy.map.resultLimitReached}</Text>
          </View>
        ) : null}

        {hasLoaded && potholes.length === 0 && !isLoading && !hasLoadError ? (
          <View style={styles.emptyNotice}>
            <Text style={styles.noticeText}>{copy.map.emptyViewport}</Text>
          </View>
        ) : null}

        {hasLoadError ? (
          <View accessibilityRole="alert" style={styles.errorNotice}>
            <View style={styles.errorCopy}>
              <Text style={styles.errorTitle}>{copy.map.loadErrorTitle}</Text>
              <Text style={styles.errorDescription}>{copy.map.loadErrorDescription}</Text>
            </View>
            <Pressable
              accessibilityLabel={copy.map.retryAction}
              accessibilityRole="button"
              onPress={retryLoad}
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}>
              <Text style={styles.retryButtonText}>{copy.map.retryAction}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {selectedPothole ? <PotholeDetailCard pothole={selectedPothole} /> : null}
    </AppScreen>
  );

  function PotholeDetailCard({ pothole }: { pothole: PublicPothole }) {
    const presentation = getPublicPotholeStatusPresentation(pothole.status);
    const statusLabel = copy.submissionStatuses[pothole.status];

    return (
      <View style={styles.detailCard}>
        <View style={styles.detailHeading}>
          <Text accessibilityRole="header" style={styles.detailTitle}>
            {copy.map.potholeTitle(pothole.publicId)}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: presentation.pillBackgroundColor }]}>
            <Text style={[styles.statusPillText, { color: presentation.pillTextColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <Text style={styles.address}>{pothole.formattedAddress ?? copy.map.addressUnavailable}</Text>

        <View style={styles.detailMeta}>
          {pothole.latestSeverity ? (
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{copy.map.severityLabel}</Text>
              <Text style={styles.metaValue}>{copy.map.severity[pothole.latestSeverity]}</Text>
            </View>
          ) : null}
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>{copy.map.statusLabel}</Text>
            <Text style={styles.metaValue}>{statusLabel}</Text>
          </View>
          <Text style={styles.reportCount}>{copy.map.reportCount(pothole.reportCount)}</Text>
        </View>
      </View>
    );
  }
}

function regionToBounds(region: Region): PublicPotholeBounds | null {
  if (
    !Number.isFinite(region.latitude) ||
    !Number.isFinite(region.longitude) ||
    !Number.isFinite(region.latitudeDelta) ||
    !Number.isFinite(region.longitudeDelta) ||
    region.latitudeDelta <= 0 ||
    region.longitudeDelta <= 0 ||
    region.latitudeDelta >= 180 ||
    region.longitudeDelta >= 360
  ) {
    return null;
  }

  const minLatitude = Math.max(-90, region.latitude - region.latitudeDelta / 2);
  const maxLatitude = Math.min(90, region.latitude + region.latitudeDelta / 2);
  const minLongitude = normalizeLongitude(region.longitude - region.longitudeDelta / 2);
  const maxLongitude = normalizeLongitude(region.longitude + region.longitudeDelta / 2);

  if (minLatitude >= maxLatitude || minLongitude === maxLongitude) {
    return null;
  }

  // `minLongitude > maxLongitude` deliberately represents an antimeridian-
  // wrapping viewport. The Edge Function and PostGIS RPC support that form.
  return {
    minLatitude,
    minLongitude,
    maxLatitude,
    maxLongitude,
  };
}

function normalizeLongitude(longitude: number): number {
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180;

  return normalized === -180 && longitude > 0 ? 180 : normalized;
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
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
  mapContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.hero,
    borderWidth: 1,
    height: 430,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  initialLoadingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    bottom: 0,
    gap: spacing.sm,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  initialLoadingText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  refreshingIndicator: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    top: spacing.sm,
  },
  refreshingText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  notices: {
    gap: spacing.sm,
  },
  limitNotice: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.border,
    borderRadius: radii.control,
    borderWidth: 1,
    padding: spacing.md,
  },
  emptyNotice: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.control,
    padding: spacing.md,
  },
  noticeText: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  errorNotice: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderRadius: radii.control,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  errorCopy: {
    gap: spacing.xxs,
  },
  errorTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  errorDescription: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  retryButtonPressed: {
    opacity: 0.75,
  },
  retryButtonText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  detailCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  detailHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  detailTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  statusPill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '800',
  },
  address: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  detailMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metaItem: {
    gap: spacing.xxs,
  },
  metaLabel: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '700',
  },
  metaValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  reportCount: {
    alignSelf: 'flex-end',
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 'auto',
  },
});
