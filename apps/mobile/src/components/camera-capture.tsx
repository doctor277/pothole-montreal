import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/src/components/action-button';
import { messages, type AppLocale } from '@/src/i18n/messages';
import { colors, radii, spacing } from '@/src/theme/tokens';

type CameraCaptureProps = {
  locale: AppLocale;
  onCaptured: (photoUri: string) => void;
};

type CameraStatePanelProps = {
  title: string;
  description: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  isAlert?: boolean;
  onAction?: () => void;
};

function CameraStatePanel({
  title,
  description,
  actionLabel,
  actionDisabled = false,
  isAlert = false,
  onAction,
}: CameraStatePanelProps) {
  return (
    <View accessibilityRole={isAlert ? 'alert' : undefined} style={styles.statePanel}>
      <View style={styles.stateCopy}>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateDescription}>{description}</Text>
      </View>
      {actionLabel && onAction ? (
        <ActionButton disabled={actionDisabled} label={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}

export function CameraCapture({ locale, onCaptured }: CameraCaptureProps) {
  const copy = messages[locale].photo;
  const cameraRef = useRef<CameraView | null>(null);
  const captureInFlightRef = useRef(false);
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [isRouteFocused, setIsRouteFocused] = useState(false);
  const [isAppActive, setIsAppActive] = useState(() => AppState.currentState === 'active');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isOpeningSettings, setIsOpeningSettings] = useState(false);
  const [permissionCheckFailed, setPermissionCheckFailed] = useState(false);
  const [cameraMountFailed, setCameraMountFailed] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const refreshPermission = useCallback(async () => {
    try {
      await getPermission();
      setPermissionCheckFailed(false);
    } catch {
      setPermissionCheckFailed(true);
    }
  }, [getPermission]);

  useFocusEffect(
    useCallback(() => {
      setIsRouteFocused(true);
      setIsAppActive(AppState.currentState === 'active');

      return () => {
        setIsRouteFocused(false);
        setIsCameraReady(false);
      };
    }, []),
  );

  useEffect(() => {
    if (!isRouteFocused) {
      return;
    }

    void refreshPermission();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const nextIsActive = nextAppState === 'active';
      setIsAppActive(nextIsActive);

      if (nextIsActive) {
        void refreshPermission();
      } else {
        setIsCameraReady(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isRouteFocused, refreshPermission]);

  const requestCameraPermission = async () => {
    setPermissionCheckFailed(false);
    setIsRequestingPermission(true);

    try {
      await requestPermission();
    } catch {
      setPermissionCheckFailed(true);
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const openSettings = async () => {
    setPermissionCheckFailed(false);
    setIsOpeningSettings(true);

    try {
      await Linking.openSettings();
    } catch {
      setPermissionCheckFailed(true);
    } finally {
      setIsOpeningSettings(false);
    }
  };

  const retryCamera = () => {
    setCameraMountFailed(false);
    setCaptureFailed(false);
    setIsCameraReady(false);
  };

  const takePhoto = async () => {
    const camera = cameraRef.current;

    if (!camera || !isCameraReady || isCapturing || captureInFlightRef.current) {
      return;
    }

    captureInFlightRef.current = true;
    setCaptureFailed(false);
    setIsCapturing(true);

    try {
      const photo = await camera.takePictureAsync();

      captureInFlightRef.current = false;
      setIsCapturing(false);
      onCaptured(photo.uri);
    } catch {
      setCaptureFailed(true);
      captureInFlightRef.current = false;
      setIsCapturing(false);
    }
  };

  if (permissionCheckFailed) {
    return (
      <CameraStatePanel
        actionLabel={copy.retryPermission}
        description={copy.permissionUnavailableDescription}
        isAlert
        onAction={() => void refreshPermission()}
        title={copy.permissionUnavailableTitle}
      />
    );
  }

  if (!permission) {
    return (
      <View style={styles.loadingPanel}>
        <ActivityIndicator color={colors.brand} size="small" />
        <View style={styles.stateCopy}>
          <Text style={styles.stateTitle}>{copy.permissionLoadingTitle}</Text>
          <Text style={styles.stateDescription}>{copy.permissionLoadingDescription}</Text>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    if (!permission.canAskAgain) {
      return (
        <CameraStatePanel
          actionDisabled={isOpeningSettings}
          actionLabel={copy.openSettings}
          description={copy.permissionPermanentlyDeniedDescription}
          isAlert
          onAction={() => void openSettings()}
          title={copy.permissionPermanentlyDeniedTitle}
        />
      );
    }

    const permissionWasDenied = permission.status === 'denied';

    return (
      <CameraStatePanel
        actionDisabled={isRequestingPermission}
        actionLabel={permissionWasDenied ? copy.retryPermission : copy.allowCameraAccess}
        description={
          permissionWasDenied ? copy.permissionDeniedDescription : copy.permissionRequiredDescription
        }
        isAlert={permissionWasDenied}
        onAction={() => void requestCameraPermission()}
        title={permissionWasDenied ? copy.permissionDeniedTitle : copy.permissionRequiredTitle}
      />
    );
  }

  if (cameraMountFailed) {
    return (
      <CameraStatePanel
        actionLabel={copy.retryCamera}
        description={copy.cameraInitializationErrorDescription}
        isAlert
        onAction={retryCamera}
        title={copy.cameraInitializationErrorTitle}
      />
    );
  }

  const shouldMountCamera = isRouteFocused && isAppActive;
  const canTakePhoto = shouldMountCamera && isCameraReady && !isCapturing;

  return (
    <View style={styles.cameraCard}>
      <View
        accessible
        accessibilityHint={copy.liveCameraAccessibilityHint}
        accessibilityLabel={copy.liveCameraAccessibilityLabel}
        accessibilityRole="image"
        style={styles.preview}>
        {shouldMountCamera ? (
          <CameraView
            accessible={false}
            facing="back"
            onCameraReady={() => setIsCameraReady(true)}
            onMountError={() => {
              setIsCameraReady(false);
              setCameraMountFailed(true);
            }}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
          />
        ) : null}

        {!isCameraReady || isCapturing ? (
          <View accessible={false} style={styles.previewStatus}>
            <ActivityIndicator color={colors.surface} size="small" />
            <Text style={styles.previewStatusLabel}>
              {isCapturing ? copy.takingPhoto : copy.cameraStarting}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.captureControls}>
        <Pressable
          accessibilityHint={copy.captureAccessibilityHint}
          accessibilityLabel={copy.captureAccessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ busy: isCapturing, disabled: !canTakePhoto }}
          disabled={!canTakePhoto}
          onPress={() => void takePhoto()}
          style={({ pressed }) => [
            styles.shutter,
            !canTakePhoto && styles.shutterDisabled,
            pressed && canTakePhoto && styles.shutterPressed,
          ]}>
          <View accessible={false} style={styles.shutterInner} />
        </Pressable>
        <Text style={styles.captureLabel}>{isCapturing ? copy.takingPhoto : copy.takePhoto}</Text>
        {!isCameraReady ? (
          <Text style={styles.captureDescription}>{copy.cameraNotReadyDescription}</Text>
        ) : null}
        {captureFailed ? (
          <View accessibilityRole="alert" style={styles.captureError}>
            <Text style={styles.captureErrorTitle}>{copy.captureErrorTitle}</Text>
            <Text style={styles.captureErrorDescription}>{copy.captureErrorDescription}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.hero,
    borderWidth: 1,
    overflow: 'hidden',
  },
  preview: {
    backgroundColor: colors.textPrimary,
    height: 300,
    overflow: 'hidden',
  },
  previewStatus: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(16, 42, 67, 0.48)',
    gap: spacing.xs,
    justifyContent: 'center',
    padding: spacing.md,
  },
  previewStatusLabel: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  captureControls: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
  },
  shutter: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 4,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  shutterDisabled: {
    backgroundColor: colors.disabledSurface,
  },
  shutterPressed: {
    backgroundColor: colors.brandPressed,
    transform: [{ scale: 0.96 }],
  },
  shutterInner: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    height: 42,
    width: 42,
  },
  captureLabel: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  captureDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  captureError: {
    alignSelf: 'stretch',
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.card,
    gap: spacing.xxs,
    marginTop: spacing.xs,
    padding: spacing.sm,
  },
  captureErrorTitle: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '800',
  },
  captureErrorDescription: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
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
});
