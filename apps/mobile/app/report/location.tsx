import * as Location from 'expo-location';
import type { LocationGeocodedAddress } from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type LatLng, type Region } from 'react-native-maps';

import { ActionButton } from '@/src/components/action-button';
import { AppScreen } from '@/src/components/app-screen';
import { ScreenHeader } from '@/src/components/screen-header';
import { StepIndicator } from '@/src/components/step-indicator';
import { messages } from '@/src/i18n/messages';
import { findNearbyPotholes } from '@/src/services/find-nearby-potholes';
import { useCitizenReport } from '@/src/state/citizen-report-context';
import { colors, radii, spacing } from '@/src/theme/tokens';
import type { ReportAddress, ReportLocation } from '@/src/types/report';
import {
  formatReportAddress,
  formatReportCoordinates,
  hasValidReportLocation,
} from '@/src/utils/report-location';

type LocationIssue = 'servicesDisabled' | 'unavailable';
type AddressLookupStatus = 'idle' | 'loading' | 'unavailable';
type NearbyCheckStatus = 'idle' | 'checking' | 'error';

type LocationStatePanelProps = {
  children?: ReactNode;
  description: string;
  isAlert?: boolean;
  title: string;
};

const streetLevelDelta = 0.0035;

function makeStreetLevelRegion(location: Pick<ReportLocation, 'latitude' | 'longitude'>): Region {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    latitudeDelta: streetLevelDelta,
    longitudeDelta: streetLevelDelta,
  };
}

function isValidMapCoordinate(coordinate: LatLng): boolean {
  return (
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  );
}

function normalizeGeocodedAddress(address: LocationGeocodedAddress): ReportAddress | null {
  const normalizedAddress: ReportAddress = {
    streetNumber: normalizeAddressValue(address.streetNumber),
    street: normalizeAddressValue(address.street),
    city: normalizeAddressValue(address.city),
    district: normalizeAddressValue(address.district),
    region: normalizeAddressValue(address.region),
    postalCode: normalizeAddressValue(address.postalCode),
    country: normalizeAddressValue(address.country),
  };

  return Object.values(normalizedAddress).some((value) => value !== null) ? normalizedAddress : null;
}

function normalizeAddressValue(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();

  return trimmedValue || null;
}

function LocationStatePanel({
  children,
  description,
  isAlert = false,
  title,
}: LocationStatePanelProps) {
  return (
    <View style={styles.statePanel}>
      <View accessibilityRole={isAlert ? 'alert' : undefined} style={styles.stateCopy}>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateDescription}>{description}</Text>
      </View>
      {children}
    </View>
  );
}

function LocationLoadingPanel({ title, description }: Pick<LocationStatePanelProps, 'title' | 'description'>) {
  return (
    <View
      accessibilityLabel={`${title}. ${description}`}
      accessibilityRole="progressbar"
      style={styles.loadingPanel}>
      <ActivityIndicator color={colors.brand} size="small" />
      <View style={styles.stateCopy}>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateDescription}>{description}</Text>
      </View>
    </View>
  );
}

export default function LocationScreen() {
  const router = useRouter();
  const {
    chooseNewPothole,
    draft,
    locale,
    setCapturedLocation,
    setLocationAddress,
    setNearbyCandidates,
  } = useCitizenReport();
  const copy = messages[locale];
  const [permission, requestPermission, getPermission] = Location.useForegroundPermissions();
  const [isRouteFocused, setIsRouteFocused] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isOpeningSettings, setIsOpeningSettings] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [permissionCheckFailed, setPermissionCheckFailed] = useState(false);
  const [locationIssue, setLocationIssue] = useState<LocationIssue | null>(null);
  const [addressLookupStatus, setAddressLookupStatus] = useState<AddressLookupStatus>('idle');
  const [nearbyCheckStatus, setNearbyCheckStatus] = useState<NearbyCheckStatus>('idle');
  const mapRef = useRef<MapView | null>(null);
  const isRouteFocusedRef = useRef(false);
  const locationRequestInFlightRef = useRef(false);
  const locationRequestIdRef = useRef(0);
  const geocodeRequestIdRef = useRef(0);
  const nearbyLookupRequestIdRef = useRef(0);
  const nearbyLookupInFlightRef = useRef(false);
  const initialLocationRequestRef = useRef(false);

  const refreshPermission = useCallback(async () => {
    try {
      await getPermission();

      if (isRouteFocusedRef.current) {
        setPermissionCheckFailed(false);
      }
    } catch {
      if (isRouteFocusedRef.current) {
        setPermissionCheckFailed(true);
      }
    }
  }, [getPermission]);

  useFocusEffect(
    useCallback(() => {
      isRouteFocusedRef.current = true;
      setIsRouteFocused(true);

      return () => {
        isRouteFocusedRef.current = false;
        locationRequestIdRef.current += 1;
        locationRequestInFlightRef.current = false;
        nearbyLookupRequestIdRef.current += 1;
        nearbyLookupInFlightRef.current = false;
        initialLocationRequestRef.current = false;
        setIsLocating(false);
        setIsOpeningSettings(false);
        setIsRequestingPermission(false);
        setNearbyCheckStatus('idle');
        setIsRouteFocused(false);
      };
    }, []),
  );

  useEffect(() => {
    if (!isRouteFocused) {
      return;
    }

    void refreshPermission();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        void refreshPermission();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isRouteFocused, refreshPermission]);

  const reverseGeocodeLocation = useCallback(
    async (reportLocation: ReportLocation) => {
      const requestId = geocodeRequestIdRef.current + 1;
      geocodeRequestIdRef.current = requestId;
      setAddressLookupStatus('loading');

      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: reportLocation.latitude,
          longitude: reportLocation.longitude,
        });

        if (geocodeRequestIdRef.current !== requestId) {
          return;
        }

        const address = results[0] ? normalizeGeocodedAddress(results[0]) : null;
        setLocationAddress(reportLocation, address);

        if (isRouteFocusedRef.current) {
          setAddressLookupStatus(formatReportAddress(address) ? 'idle' : 'unavailable');
        }
      } catch {
        if (geocodeRequestIdRef.current !== requestId) {
          return;
        }

        setLocationAddress(reportLocation, null);

        if (isRouteFocusedRef.current) {
          setAddressLookupStatus('unavailable');
        }
      }
    },
    [setLocationAddress],
  );

  const invalidateNearbyLookup = useCallback(() => {
    nearbyLookupRequestIdRef.current += 1;
    nearbyLookupInFlightRef.current = false;

    if (isRouteFocusedRef.current) {
      setNearbyCheckStatus('idle');
    }
  }, []);

  const requestCurrentLocation = useCallback(async () => {
    if (!isRouteFocusedRef.current || locationRequestInFlightRef.current) {
      return;
    }

    const requestId = locationRequestIdRef.current + 1;
    locationRequestIdRef.current = requestId;
    locationRequestInFlightRef.current = true;
    setLocationIssue(null);
    setIsLocating(true);

    const isCurrentRequest = () =>
      isRouteFocusedRef.current && locationRequestIdRef.current === requestId;

    try {
      const locationServicesEnabled = await Location.hasServicesEnabledAsync();

      if (!isCurrentRequest()) {
        return;
      }

      if (!locationServicesEnabled) {
        setLocationIssue('servicesDisabled');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      if (!isCurrentRequest()) {
        return;
      }

      const { accuracy, latitude, longitude } = position.coords;

      if (!isValidMapCoordinate({ latitude, longitude })) {
        setLocationIssue('unavailable');
        return;
      }

      const reportLocation: ReportLocation = {
        latitude,
        longitude,
        accuracy: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
        source: 'gps',
        address: null,
      };

      invalidateNearbyLookup();
      setCapturedLocation(reportLocation);
      mapRef.current?.animateToRegion(makeStreetLevelRegion(reportLocation), 350);
      void reverseGeocodeLocation(reportLocation);
    } catch {
      if (isCurrentRequest()) {
        setLocationIssue('unavailable');
      }
    } finally {
      if (isCurrentRequest()) {
        locationRequestInFlightRef.current = false;
        setIsLocating(false);
      }
    }
  }, [invalidateNearbyLookup, reverseGeocodeLocation, setCapturedLocation]);

  useEffect(() => {
    if (
      !isRouteFocused ||
      !permission?.granted ||
      hasValidReportLocation(draft.location) ||
      initialLocationRequestRef.current
    ) {
      return;
    }

    initialLocationRequestRef.current = true;
    void requestCurrentLocation();
  }, [draft.location, isRouteFocused, permission?.granted, requestCurrentLocation]);

  const requestForegroundPermission = async () => {
    if (isRequestingPermission) {
      return;
    }

    setPermissionCheckFailed(false);
    setIsRequestingPermission(true);

    try {
      const response = await requestPermission();

      if (isRouteFocusedRef.current && response.granted) {
        initialLocationRequestRef.current = true;
        void requestCurrentLocation();
      }
    } catch {
      if (isRouteFocusedRef.current) {
        setPermissionCheckFailed(true);
      }
    } finally {
      if (isRouteFocusedRef.current) {
        setIsRequestingPermission(false);
      }
    }
  };

  const openSettings = async () => {
    setPermissionCheckFailed(false);
    setIsOpeningSettings(true);

    try {
      await Linking.openSettings();
    } catch {
      if (isRouteFocusedRef.current) {
        setPermissionCheckFailed(true);
      }
    } finally {
      if (isRouteFocusedRef.current) {
        setIsOpeningSettings(false);
      }
    }
  };

  const retryLocation = () => {
    initialLocationRequestRef.current = true;
    invalidateNearbyLookup();
    void requestCurrentLocation();
  };

  const adjustPotholePin = useCallback(
    (coordinate: LatLng) => {
      const currentLocation = draft.location;

      if (!hasValidReportLocation(currentLocation) || !isValidMapCoordinate(coordinate)) {
        return;
      }

      const adjustedLocation: ReportLocation = {
        ...currentLocation,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        source: 'adjusted',
        address: null,
      };

      invalidateNearbyLookup();
      setCapturedLocation(adjustedLocation);
      setLocationIssue(null);
      void reverseGeocodeLocation(adjustedLocation);
    },
    [draft.location, invalidateNearbyLookup, reverseGeocodeLocation, setCapturedLocation],
  );

  const reportLocation = hasValidReportLocation(draft.location) ? draft.location : null;
  const hasLocation = Boolean(reportLocation);
  const initialMapRegion = reportLocation ? makeStreetLevelRegion(reportLocation) : null;
  const formattedAddress = reportLocation ? formatReportAddress(reportLocation.address) : null;
  const coordinates = reportLocation ? formatReportCoordinates(reportLocation) : null;
  const accuracy =
    reportLocation && reportLocation.accuracy !== null
      ? reportLocation.source === 'adjusted'
        ? copy.location.originalGpsAccuracy(Math.round(reportLocation.accuracy))
        : copy.location.accuracy(Math.round(reportLocation.accuracy))
      : null;
  const locationSource =
    reportLocation?.source === 'adjusted'
      ? copy.location.pinAdjustedManually
      : copy.location.locationSetFromGps;
  const canContinue = Boolean(
    hasLocation && permission?.granted && !permissionCheckFailed && !isLocating,
  );
  const isCheckingNearby = nearbyCheckStatus === 'checking';

  const checkNearbyPotholes = useCallback(async () => {
    if (!reportLocation || nearbyLookupInFlightRef.current || !isRouteFocusedRef.current) {
      return;
    }

    const requestId = nearbyLookupRequestIdRef.current + 1;
    nearbyLookupRequestIdRef.current = requestId;
    nearbyLookupInFlightRef.current = true;
    setNearbyCheckStatus('checking');

    const isCurrentRequest = () =>
      isRouteFocusedRef.current && nearbyLookupRequestIdRef.current === requestId;

    try {
      const result = await findNearbyPotholes(reportLocation);

      if (!isCurrentRequest()) {
        return;
      }

      // A successful new response replaces an earlier candidate choice for
      // this location. Until then, a lookup outage leaves the draft intact.
      setNearbyCandidates(result.candidates);
      setNearbyCheckStatus('idle');
      router.push(result.candidates.length > 0 ? '/report/nearby' : '/report/details');
    } catch {
      if (isCurrentRequest()) {
        setNearbyCheckStatus('error');
      }
    } finally {
      if (nearbyLookupRequestIdRef.current === requestId) {
        nearbyLookupInFlightRef.current = false;
      }
    }
  }, [reportLocation, router, setNearbyCandidates]);

  const continueWithoutNearbyCheck = () => {
    chooseNewPothole();
    router.push('/report/details');
  };

  const renderLocationState = () => {
    if (permissionCheckFailed) {
      return (
        <LocationStatePanel
          description={copy.location.permissionUnavailableDescription}
          isAlert
          title={copy.location.permissionUnavailableTitle}>
          <ActionButton
            accessibilityHint={copy.location.retryPermissionAccessibilityHint}
            accessibilityLabel={copy.location.retryPermissionAccessibilityLabel}
            label={copy.location.retryPermission}
            onPress={() => void refreshPermission()}
          />
        </LocationStatePanel>
      );
    }

    if (!permission) {
      return (
        <LocationLoadingPanel
          description={copy.location.permissionLoadingDescription}
          title={copy.location.permissionLoadingTitle}
        />
      );
    }

    if (!permission.granted) {
      if (!permission.canAskAgain) {
        return (
          <LocationStatePanel
            description={copy.location.permissionPermanentlyDeniedDescription}
            isAlert
            title={copy.location.permissionPermanentlyDeniedTitle}>
            <ActionButton
              accessibilityHint={copy.location.openSettingsAccessibilityHint}
              accessibilityLabel={copy.location.openSettingsAccessibilityLabel}
              busy={isOpeningSettings}
              label={copy.location.openSettings}
              onPress={() => void openSettings()}
            />
          </LocationStatePanel>
        );
      }

      const permissionWasDenied = permission.status === 'denied';

      return (
        <LocationStatePanel
          description={
            permissionWasDenied
              ? copy.location.permissionDeniedDescription
              : copy.location.permissionRequiredDescription
          }
          isAlert={permissionWasDenied}
          title={
            permissionWasDenied
              ? copy.location.permissionDeniedTitle
              : copy.location.permissionRequiredTitle
          }>
          <ActionButton
            accessibilityHint={
              permissionWasDenied
                ? copy.location.retryPermissionAccessibilityHint
                : copy.location.allowLocationAccessAccessibilityHint
            }
            accessibilityLabel={
              permissionWasDenied
                ? copy.location.retryPermissionAccessibilityLabel
                : copy.location.allowLocationAccessAccessibilityLabel
            }
            busy={isRequestingPermission}
            label={
              isRequestingPermission
                ? copy.location.requestingLocationAccess
                : permissionWasDenied
                  ? copy.location.retryPermission
                  : copy.location.allowLocationAccess
            }
            onPress={() => void requestForegroundPermission()}
          />
        </LocationStatePanel>
      );
    }

    const issuePanel =
      locationIssue === 'servicesDisabled' ? (
        <LocationStatePanel
          description={copy.location.locationServicesDisabledDescription}
          isAlert
          title={copy.location.locationServicesDisabledTitle}>
          <View style={styles.panelActions}>
            <ActionButton
              accessibilityHint={copy.location.openSettingsAccessibilityHint}
              accessibilityLabel={copy.location.openSettingsAccessibilityLabel}
              busy={isOpeningSettings}
              label={copy.location.openSettings}
              onPress={() => void openSettings()}
              variant="secondary"
            />
            <ActionButton
              accessibilityHint={copy.location.tryAgainAccessibilityHint}
              accessibilityLabel={copy.location.tryAgainAccessibilityLabel}
              label={copy.location.tryAgain}
              onPress={retryLocation}
            />
          </View>
        </LocationStatePanel>
      ) : locationIssue === 'unavailable' ? (
        <LocationStatePanel
          description={copy.location.locationFailureDescription}
          isAlert
          title={copy.location.locationFailureTitle}>
          <ActionButton
            accessibilityHint={copy.location.tryAgainAccessibilityHint}
            accessibilityLabel={copy.location.tryAgainAccessibilityLabel}
            label={copy.location.tryAgain}
            onPress={retryLocation}
          />
        </LocationStatePanel>
      ) : null;

    return (
      <>
        {reportLocation && initialMapRegion && coordinates ? (
          <View style={styles.locationConfirmation}>
            <View style={styles.mapContainer}>
              <MapView
                ref={mapRef}
                accessibilityHint={copy.location.mapAccessibilityHint}
                accessibilityLabel={copy.location.mapAccessibilityLabel}
                initialRegion={initialMapRegion}
                loadingEnabled
                mapType="standard"
                pitchEnabled={false}
                rotateEnabled={false}
                showsBuildings={false}
                showsCompass={false}
                showsPointsOfInterest={false}
                showsScale={false}
                style={styles.map}
                zoomEnabled>
                <Marker
                  accessibilityHint={copy.location.potholePinAccessibilityHint}
                  accessibilityLabel={copy.location.potholePinAccessibilityLabel}
                  coordinate={reportLocation}
                  description={copy.location.adjustPinInstruction}
                  draggable={!isLocating}
                  isPreselected={!isLocating && Platform.OS === 'ios'}
                  onDragEnd={(event) => adjustPotholePin(event.nativeEvent.coordinate)}
                  pinColor={colors.brand}
                  title={copy.location.potholeLocation}
                />
              </MapView>
            </View>

            <Text style={styles.mapInstruction}>{copy.location.adjustPinInstruction}</Text>

            <View style={styles.locationSummary}>
              <Text style={styles.locationSummaryLabel}>{copy.location.potholeLocation}</Text>
              {formattedAddress ? (
                <View style={styles.addressCopy}>
                  <Text style={styles.addressPrimary}>{formattedAddress.primary}</Text>
                  {formattedAddress.secondary ? (
                    <Text style={styles.addressSecondary}>{formattedAddress.secondary}</Text>
                  ) : null}
                  <Text style={styles.coordinates}>{coordinates}</Text>
                </View>
              ) : (
                <Text style={styles.addressPrimary}>{coordinates}</Text>
              )}

              {addressLookupStatus === 'loading' ? (
                <View accessibilityRole="progressbar" style={styles.addressLookupStatus}>
                  <ActivityIndicator color={colors.brand} size="small" />
                  <Text style={styles.addressLookupText}>{copy.location.findingAddress}</Text>
                </View>
              ) : null}

              {addressLookupStatus === 'unavailable' ? (
                <View accessibilityRole="alert" style={styles.addressUnavailable}>
                  <Text style={styles.addressUnavailableTitle}>{copy.location.addressUnavailableTitle}</Text>
                  <Text style={styles.addressUnavailableDescription}>
                    {copy.location.addressUnavailableDescription}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.locationSource}>{locationSource}</Text>
              {accuracy ? <Text style={styles.accuracy}>{accuracy}</Text> : null}
            </View>
          </View>
        ) : null}

        {!hasLocation && isLocating ? (
          <LocationLoadingPanel
            description={copy.location.findingLocationDescription}
            title={copy.location.findingLocationTitle}
          />
        ) : null}

        {hasLocation && isLocating ? (
          <LocationLoadingPanel
            description={copy.location.findingLocationDescription}
            title={copy.location.refreshingLocationTitle}
          />
        ) : null}

        {!hasLocation && !isLocating && !locationIssue ? (
          <LocationLoadingPanel
            description={copy.location.findingLocationDescription}
            title={copy.location.findingLocationTitle}
          />
        ) : null}

        {issuePanel}
      </>
    );
  };

  return (
    <AppScreen contentStyle={styles.content}>
      <ScreenHeader />

      <View style={styles.body}>
        <StepIndicator current={2} label={copy.location.step} total={3} />

        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>
            {copy.location.title}
          </Text>
          <Text style={styles.description}>{copy.location.description}</Text>
        </View>

        {renderLocationState()}

        {nearbyCheckStatus === 'error' ? (
          <LocationStatePanel
            description={copy.location.nearbyCheckErrorDescription}
            isAlert
            title={copy.location.nearbyCheckErrorTitle}>
            <View style={styles.panelActions}>
              <ActionButton label={copy.location.retryNearbyCheck} onPress={() => void checkNearbyPotholes()} />
              <ActionButton
                label={copy.location.continueWithoutNearbyCheck}
                onPress={continueWithoutNearbyCheck}
                variant="secondary"
              />
            </View>
          </LocationStatePanel>
        ) : null}

        <View style={styles.actions}>
          {hasLocation ? (
            <ActionButton
              accessibilityHint={copy.location.refreshLocationAccessibilityHint}
              accessibilityLabel={copy.location.refreshLocationAccessibilityLabel}
              busy={isLocating}
              label={copy.location.refreshLocation}
              onPress={retryLocation}
              variant="secondary"
            />
          ) : null}
          <ActionButton
            accessibilityHint={copy.location.continueWithLocationAccessibilityHint}
            accessibilityLabel={copy.location.continueWithLocationAccessibilityLabel}
            busy={isCheckingNearby}
            disabled={!canContinue}
            label={isCheckingNearby ? copy.location.checkingNearbyReports : copy.common.continue}
            onPress={() => void checkNearbyPotholes()}
          />
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
  locationConfirmation: {
    gap: spacing.sm,
  },
  mapContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.hero,
    borderWidth: 1,
    height: 300,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  mapInstruction: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  locationSummary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  locationSummaryLabel: {
    color: colors.brand,
    fontSize: 14,
    fontWeight: '800',
  },
  addressCopy: {
    gap: spacing.xxs,
  },
  addressPrimary: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 23,
  },
  addressSecondary: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  coordinates: {
    color: colors.textTertiary,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  addressLookupStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  addressLookupText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  addressUnavailable: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.small,
    gap: spacing.xxs,
    padding: spacing.sm,
  },
  addressUnavailableTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  addressUnavailableDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  locationSource: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  accuracy: {
    color: colors.textTertiary,
    fontSize: 13,
    lineHeight: 18,
  },
  statePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.hero,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  loadingPanel: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.hero,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  stateCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  stateDescription: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  panelActions: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
