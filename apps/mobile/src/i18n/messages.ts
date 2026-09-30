import type { PublicPotholeSeverity } from '@/src/types/public-pothole';
import type { Severity, SubmittedPotholeStatus } from '@/src/types/report';

export const supportedLocales = ['en', 'fr'] as const;

export type AppLocale = (typeof supportedLocales)[number];

export const defaultLocale: AppLocale = 'en';

type SeverityCopy = {
  label: string;
  description: string;
};

type MessageCatalog = {
  common: {
    languageLabels: Record<AppLocale, string>;
    languageAccessibilityLabels: Record<AppLocale, string>;
    languageControlAccessibilityLabel: string;
    back: string;
    backAccessibilityLabel: string;
    continue: string;
    edit: string;
    done: string;
  };
  home: {
    appName: string;
    headline: string;
    communityMessage: string;
    speedMessage: string;
    reportAction: string;
    mapAction: string;
  };
  photo: {
    step: string;
    title: string;
    description: string;
    permissionLoadingTitle: string;
    permissionLoadingDescription: string;
    permissionUnavailableTitle: string;
    permissionUnavailableDescription: string;
    permissionRequiredTitle: string;
    permissionRequiredDescription: string;
    allowCameraAccess: string;
    permissionDeniedTitle: string;
    permissionDeniedDescription: string;
    retryPermission: string;
    permissionPermanentlyDeniedTitle: string;
    permissionPermanentlyDeniedDescription: string;
    openSettings: string;
    cameraStarting: string;
    cameraNotReady: string;
    cameraNotReadyDescription: string;
    cameraInitializationErrorTitle: string;
    cameraInitializationErrorDescription: string;
    retryCamera: string;
    takingPhoto: string;
    captureErrorTitle: string;
    captureErrorDescription: string;
    capturedPhotoPreview: string;
    capturedPhotoDescription: string;
    takePhoto: string;
    retakePhoto: string;
    liveCameraAccessibilityLabel: string;
    liveCameraAccessibilityHint: string;
    captureAccessibilityLabel: string;
    captureAccessibilityHint: string;
    retakePhotoAccessibilityLabel: string;
    retakePhotoAccessibilityHint: string;
    continueWithPhotoAccessibilityLabel: string;
    continueWithPhotoAccessibilityHint: string;
  };
  location: {
    step: string;
    title: string;
    description: string;
    permissionLoadingTitle: string;
    permissionLoadingDescription: string;
    permissionUnavailableTitle: string;
    permissionUnavailableDescription: string;
    permissionRequiredTitle: string;
    permissionRequiredDescription: string;
    allowLocationAccess: string;
    requestingLocationAccess: string;
    allowLocationAccessAccessibilityLabel: string;
    allowLocationAccessAccessibilityHint: string;
    permissionDeniedTitle: string;
    permissionDeniedDescription: string;
    retryPermission: string;
    retryPermissionAccessibilityLabel: string;
    retryPermissionAccessibilityHint: string;
    permissionPermanentlyDeniedTitle: string;
    permissionPermanentlyDeniedDescription: string;
    locationServicesDisabledTitle: string;
    locationServicesDisabledDescription: string;
    openSettings: string;
    openSettingsAccessibilityLabel: string;
    openSettingsAccessibilityHint: string;
    findingLocationTitle: string;
    findingLocationDescription: string;
    locationFailureTitle: string;
    locationFailureDescription: string;
    tryAgain: string;
    tryAgainAccessibilityLabel: string;
    tryAgainAccessibilityHint: string;
    refreshingLocationTitle: string;
    adjustPinInstruction: string;
    potholeLocation: string;
    findingAddress: string;
    addressUnavailableTitle: string;
    addressUnavailableDescription: string;
    locationSetFromGps: string;
    pinAdjustedManually: string;
    accuracy: (metres: number) => string;
    originalGpsAccuracy: (metres: number) => string;
    mapAccessibilityLabel: string;
    mapAccessibilityHint: string;
    potholePinAccessibilityLabel: string;
    potholePinAccessibilityHint: string;
    refreshLocation: string;
    refreshLocationAccessibilityLabel: string;
    refreshLocationAccessibilityHint: string;
    continueWithLocationAccessibilityLabel: string;
    continueWithLocationAccessibilityHint: string;
    checkingNearbyReports: string;
    nearbyCheckErrorTitle: string;
    nearbyCheckErrorDescription: string;
    retryNearbyCheck: string;
    continueWithoutNearbyCheck: string;
  };
  nearby: {
    title: string;
    description: string;
    distance: (metres: number) => string;
    samePotholeAction: string;
    noneOfTheseAction: string;
  };
  details: {
    step: string;
    title: string;
    description: string;
    severity: Record<Severity, SeverityCopy>;
    optionalNote: string;
    notePlaceholder: string;
    reviewAction: string;
  };
  review: {
    title: string;
    photo: string;
    photoRequired: string;
    location: string;
    locationRequired: string;
    severity: string;
    note: string;
    submitAction: string;
    submittingAction: string;
    preparingReport: string;
    uploadingPhoto: string;
    savingReport: string;
    submissionErrorTitle: string;
    submissionErrorDescription: string;
    photoTooLargeTitle: string;
    photoTooLargeDescription: string;
    photoInvalidTitle: string;
    photoInvalidDescription: string;
    photoUploadErrorTitle: string;
    photoUploadErrorDescription: string;
    addingToExistingPothole: string;
    existingPotholeUnavailableTitle: string;
    existingPotholeUnavailableDescription: string;
    checkNearbyAgainAction: string;
    retryAction: string;
  };
  success: {
    title: string;
    description: string;
    reference: (id: string) => string;
    existingPotholeDescription: string;
    reportCount: (count: number) => string;
    statusLabel: string;
    statusDescription: string;
    viewReportAction: string;
  };
  reportStatus: {
    title: string;
    description: string;
    existingPotholeDescription: string;
    receivedLabel: string;
    existingPotholeStatusLabel: string;
  };
  submissionStatuses: Record<SubmittedPotholeStatus, string>;
  map: {
    title: string;
    description: string;
    mapAccessibilityLabel: string;
    mapAccessibilityHint: string;
    loading: string;
    refreshing: string;
    emptyViewport: string;
    loadErrorTitle: string;
    loadErrorDescription: string;
    retryAction: string;
    resultLimitReached: string;
    potholeTitle: (publicId: string) => string;
    markerAccessibilityLabel: (publicId: string, status: string) => string;
    addressUnavailable: string;
    statusLabel: string;
    severityLabel: string;
    reportCount: (count: number) => string;
    severity: Record<PublicPotholeSeverity, string>;
  };
};

export const messages = {
  en: {
    common: {
      languageLabels: { en: 'EN', fr: 'FR' },
      languageAccessibilityLabels: {
        en: 'English',
        fr: 'French',
      },
      languageControlAccessibilityLabel: 'Language',
      back: 'Back',
      backAccessibilityLabel: 'Go back',
      continue: 'Continue',
      edit: 'Edit',
      done: 'Done',
    },
    home: {
      appName: 'Pothole MTL',
      headline: 'See it. Report it.',
      communityMessage: "Help make Montr\u00e9al's roads safer.",
      speedMessage: 'Report road damage in seconds.',
      reportAction: 'Report a Pothole',
      mapAction: 'View potholes on map',
    },
    photo: {
      step: 'Step 1 of 3',
      title: 'Take a clear photo',
      description: 'Make sure the pothole is visible and you are standing somewhere safe.',
      permissionLoadingTitle: 'Checking camera access',
      permissionLoadingDescription: 'Please wait a moment.',
      permissionUnavailableTitle: 'Camera access unavailable',
      permissionUnavailableDescription: "We couldn't check camera access right now. Please try again.",
      permissionRequiredTitle: 'Camera access needed',
      permissionRequiredDescription:
        'Pothole MTL uses your camera so you can photograph road damage when submitting a pothole report.',
      allowCameraAccess: 'Allow Camera Access',
      permissionDeniedTitle: 'Camera access not allowed',
      permissionDeniedDescription: 'Allow camera access to take a photo of the road damage.',
      retryPermission: 'Try Again',
      permissionPermanentlyDeniedTitle: 'Enable camera access in Settings',
      permissionPermanentlyDeniedDescription:
        'To take a photo, enable Camera for Pothole MTL in your iPhone Settings.',
      openSettings: 'Open Settings',
      cameraStarting: 'Starting camera\u2026',
      cameraNotReady: 'Getting camera ready…',
      cameraNotReadyDescription: 'You can take a photo as soon as the camera is ready.',
      cameraInitializationErrorTitle: "Couldn't start the camera",
      cameraInitializationErrorDescription:
        'Please try again. If the problem continues, return and reopen this step.',
      retryCamera: 'Try Camera Again',
      takingPhoto: 'Taking photo\u2026',
      captureErrorTitle: "Couldn't take the photo",
      captureErrorDescription: 'Please try again.',
      capturedPhotoPreview: 'Captured photo',
      capturedPhotoDescription: 'Review your photo before continuing.',
      takePhoto: 'Take Photo',
      retakePhoto: 'Retake Photo',
      liveCameraAccessibilityLabel: 'Live rear camera preview',
      liveCameraAccessibilityHint: 'Point the camera at the pothole and stay somewhere safe.',
      captureAccessibilityLabel: 'Take pothole photo',
      captureAccessibilityHint: 'Takes a photo of the road damage.',
      retakePhotoAccessibilityLabel: 'Retake pothole photo',
      retakePhotoAccessibilityHint: 'Discards the current photo and opens the camera.',
      continueWithPhotoAccessibilityLabel: 'Continue with this photo',
      continueWithPhotoAccessibilityHint: 'Continue to confirm the location.',
    },
    location: {
      step: 'Step 2 of 3',
      title: 'Confirm the location',
      description: 'Make sure the pin is on the pothole.',
      permissionLoadingTitle: 'Checking location access',
      permissionLoadingDescription: 'Please wait a moment.',
      permissionUnavailableTitle: 'Location access unavailable',
      permissionUnavailableDescription: "We couldn't check location access right now. Please try again.",
      permissionRequiredTitle: 'Location access needed',
      permissionRequiredDescription:
        'Pothole MTL uses your location to identify where the reported pothole is located.',
      allowLocationAccess: 'Allow Location Access',
      requestingLocationAccess: 'Requesting location access\u2026',
      allowLocationAccessAccessibilityLabel: 'Allow Location Access',
      allowLocationAccessAccessibilityHint:
        'Opens the iPhone permission prompt so Pothole MTL can find this pothole.',
      permissionDeniedTitle: 'Location access not allowed',
      permissionDeniedDescription: 'Allow location access to identify where this pothole is located.',
      retryPermission: 'Try Again',
      retryPermissionAccessibilityLabel: 'Try location permission again',
      retryPermissionAccessibilityHint:
        'Opens the iPhone permission prompt so Pothole MTL can find this pothole.',
      permissionPermanentlyDeniedTitle: 'Enable location access in Settings',
      permissionPermanentlyDeniedDescription:
        'To find this pothole, enable Location for Pothole MTL in your iPhone Settings.',
      locationServicesDisabledTitle: 'Turn on Location Services',
      locationServicesDisabledDescription:
        'Turn on Location Services in your iPhone Settings, then try again.',
      openSettings: 'Open Settings',
      openSettingsAccessibilityLabel: 'Open Settings',
      openSettingsAccessibilityHint: 'Opens Pothole MTL settings on your iPhone.',
      findingLocationTitle: 'Finding your location\u2026',
      findingLocationDescription: 'This can take a moment, especially indoors.',
      locationFailureTitle: "Couldn't find your location",
      locationFailureDescription: 'Make sure Location Services are on, then try again.',
      tryAgain: 'Try Again',
      tryAgainAccessibilityLabel: 'Try to find your location again',
      tryAgainAccessibilityHint: 'Tries to find your current location again.',
      refreshingLocationTitle: 'Refreshing location\u2026',
      adjustPinInstruction: 'Drag the pin to the exact pothole location if needed.',
      potholeLocation: 'Pothole location',
      findingAddress: 'Finding street address\u2026',
      addressUnavailableTitle: 'Street address unavailable',
      addressUnavailableDescription: 'You can still continue with the pinned location.',
      locationSetFromGps: 'Location set from GPS',
      pinAdjustedManually: 'Pin adjusted manually',
      accuracy: (metres) => `Accuracy: \u00b1${metres} m`,
      originalGpsAccuracy: (metres) => `Original GPS accuracy: \u00b1${metres} m`,
      mapAccessibilityLabel: 'Map showing the selected pothole location',
      mapAccessibilityHint: 'Drag the pothole pin to correct its position.',
      potholePinAccessibilityLabel: 'Pothole location pin',
      potholePinAccessibilityHint:
        'Drag the pin to the exact pothole location. The address updates after you release it.',
      refreshLocation: 'Refresh Location',
      refreshLocationAccessibilityLabel: 'Refresh Location',
      refreshLocationAccessibilityHint: 'Gets a new one-time location fix.',
      continueWithLocationAccessibilityLabel: 'Continue with this location',
      continueWithLocationAccessibilityHint: 'Continue to describe the pothole.',
      checkingNearbyReports: 'Checking nearby reports\u2026',
      nearbyCheckErrorTitle: "We couldn't check nearby reports",
      nearbyCheckErrorDescription:
        'Your report is still here. Try again or continue without checking.',
      retryNearbyCheck: 'Retry',
      continueWithoutNearbyCheck: 'Continue without checking',
    },
    nearby: {
      title: 'Already reported nearby?',
      description:
        'We found potholes close to this location. Check whether one of these is the same pothole.',
      distance: (metres) => `${metres} m away`,
      samePotholeAction: 'This is the same pothole',
      noneOfTheseAction: 'None of these \u2014 report a new pothole',
    },
    details: {
      step: 'Step 3 of 3',
      title: 'How serious does it look?',
      description: 'Choose the closest option. You can also leave a short note.',
      severity: {
        small: {
          label: 'Small',
          description: 'Minor surface damage',
        },
        medium: {
          label: 'Medium',
          description: 'Noticeable impact while driving',
        },
        large: {
          label: 'Large / Dangerous',
          description: 'Deep, wide or potentially hazardous',
        },
      },
      optionalNote: 'Optional note',
      notePlaceholder: 'Example: Deep pothole in the right lane',
      reviewAction: 'Review Report',
    },
    review: {
      title: 'Review your report',
      photo: 'Photo',
      photoRequired: 'A photo is required before submitting your report.',
      location: 'Location',
      locationRequired: 'A location is required before submitting your report.',
      severity: 'Severity',
      note: 'Note',
      submitAction: 'Submit Report',
      submittingAction: 'Submitting\u2026',
      preparingReport: 'Preparing report\u2026',
      uploadingPhoto: 'Uploading photo\u2026',
      savingReport: 'Saving report\u2026',
      submissionErrorTitle: "We couldn't submit your report",
      submissionErrorDescription: 'Your information is still here. Please try again.',
      photoTooLargeTitle: 'Photo is too large',
      photoTooLargeDescription: 'Take another photo that is 10 MB or smaller, then try again.',
      photoInvalidTitle: "We couldn't use this photo",
      photoInvalidDescription: 'Please retake the photo and try again.',
      photoUploadErrorTitle: "We couldn't upload your photo",
      photoUploadErrorDescription: 'Your report details are still here. Please try again.',
      addingToExistingPothole: 'Adding to existing pothole',
      existingPotholeUnavailableTitle: 'That nearby pothole is no longer available',
      existingPotholeUnavailableDescription: 'Please check nearby reports again before submitting.',
      checkNearbyAgainAction: 'Check nearby reports again',
      retryAction: 'Retry',
    },
    success: {
      title: 'Report received',
      description: "Thanks for helping improve Montr\u00e9al's roads.",
      reference: (id) => `Pothole #${id}`,
      existingPotholeDescription: 'Your report was added to an existing pothole.',
      reportCount: (count) => (count === 1 ? '1 report' : `${count} reports`),
      statusLabel: 'Status',
      statusDescription: "We'll update you when the status changes.",
      viewReportAction: 'View Report',
    },
    reportStatus: {
      title: 'Report status',
      description: 'Your report has been received and is waiting for review.',
      existingPotholeDescription:
        'Your report was added to an existing pothole. Its current status is shown below.',
      receivedLabel: 'Report received',
      existingPotholeStatusLabel: 'Current pothole status',
    },
    submissionStatuses: {
      REPORTED: 'Reported',
      UNDER_REVIEW: 'Under review',
      VERIFIED: 'Verified',
      ASSIGNED: 'Assigned',
      ACCEPTED: 'Accepted',
      IN_PROGRESS: 'In progress',
      REPAIRED: 'Repaired',
      REJECTED: 'Rejected',
      DUPLICATE: 'Duplicate',
    },
    map: {
      title: 'Reported potholes',
      description: 'Explore reported potholes in the visible area.',
      mapAccessibilityLabel: 'Map of reported potholes',
      mapAccessibilityHint: 'Move the map to load potholes in the visible area.',
      loading: 'Loading reported potholes\u2026',
      refreshing: 'Refreshing map\u2026',
      emptyViewport: 'No reported potholes in this area.',
      loadErrorTitle: "We couldn't load potholes right now.",
      loadErrorDescription: 'Please try again.',
      retryAction: 'Try again',
      resultLimitReached: 'Too many potholes in this area. Zoom in to see more.',
      potholeTitle: (publicId) => `Pothole ${publicId}`,
      markerAccessibilityLabel: (publicId, status) => `Pothole ${publicId}. ${status}.`,
      addressUnavailable: 'Address unavailable',
      statusLabel: 'Status',
      severityLabel: 'Severity',
      reportCount: (count) => (count === 1 ? '1 report' : `${count} reports`),
      severity: {
        SMALL: 'Small',
        MEDIUM: 'Medium',
        DANGEROUS: 'Dangerous',
      },
    },
  },
  fr: {
    common: {
      languageLabels: { en: 'EN', fr: 'FR' },
      languageAccessibilityLabels: {
        en: 'Anglais',
        fr: 'Fran\u00e7ais',
      },
      languageControlAccessibilityLabel: 'Langue',
      back: 'Retour',
      backAccessibilityLabel: 'Revenir \u00e0 l\'\u00e9cran pr\u00e9c\u00e9dent',
      continue: 'Continuer',
      edit: 'Modifier',
      done: 'Termin\u00e9',
    },
    home: {
      appName: 'Pothole MTL',
      headline: 'Vous le voyez. Signalez-le.',
      communityMessage: 'Aidez \u00e0 rendre les routes de Montr\u00e9al plus s\u00fbres.',
      speedMessage: 'Signalez les dommages routiers en quelques secondes.',
      reportAction: 'Signaler un nid-de-poule',
      mapAction: 'Voir les nids-de-poule sur la carte',
    },
    photo: {
      step: '\u00c9tape 1 sur 3',
      title: 'Prenez une photo nette',
      description:
        'Assurez-vous que le nid-de-poule est bien visible et que vous \u00eates dans un endroit s\u00fbr.',
      permissionLoadingTitle: "V\u00e9rification de l'acc\u00e8s \u00e0 l'appareil photo",
      permissionLoadingDescription: 'Veuillez patienter un instant.',
      permissionUnavailableTitle: "Acc\u00e8s \u00e0 l'appareil photo indisponible",
      permissionUnavailableDescription:
        "Nous ne pouvons pas v\u00e9rifier l'acc\u00e8s \u00e0 l'appareil photo pour le moment. R\u00e9essayez.",
      permissionRequiredTitle: "Acc\u00e8s \u00e0 l'appareil photo requis",
      permissionRequiredDescription:
        "Pothole MTL utilise votre appareil photo pour vous permettre de photographier des dommages routiers lors d'un signalement de nid-de-poule.",
      allowCameraAccess: "Autoriser l'acc\u00e8s \u00e0 l'appareil photo",
      permissionDeniedTitle: "Acc\u00e8s \u00e0 l'appareil photo refus\u00e9",
      permissionDeniedDescription:
        "Autorisez l'acc\u00e8s \u00e0 l'appareil photo pour prendre une photo des dommages routiers.",
      retryPermission: 'R\u00e9essayer',
      permissionPermanentlyDeniedTitle: "Activez l'acc\u00e8s \u00e0 l'appareil photo dans R\u00e9glages",
      permissionPermanentlyDeniedDescription:
        "Pour prendre une photo, activez l'acc\u00e8s \u00e0 l'appareil photo pour Pothole MTL dans les R\u00e9glages de votre iPhone.",
      openSettings: 'Ouvrir R\u00e9glages',
      cameraStarting: "D\u00e9marrage de l'appareil photo\u2026",
      cameraNotReady: "Pr\u00e9paration de l'appareil photo\u2026",
      cameraNotReadyDescription: "La prise de photo sera possible d\u00e8s que l'appareil photo sera pr\u00eat.",
      cameraInitializationErrorTitle: "Impossible de d\u00e9marrer l'appareil photo",
      cameraInitializationErrorDescription:
        "R\u00e9essayez. Si le probl\u00e8me persiste, revenez \u00e0 l'\u00e9tape pr\u00e9c\u00e9dente puis ouvrez-la de nouveau.",
      retryCamera: "R\u00e9essayer l'appareil photo",
      takingPhoto: 'Prise de la photo\u2026',
      captureErrorTitle: 'Impossible de prendre la photo',
      captureErrorDescription: 'R\u00e9essayez.',
      capturedPhotoPreview: 'Photo prise',
      capturedPhotoDescription: 'V\u00e9rifiez votre photo avant de continuer.',
      takePhoto: 'Prendre une photo',
      retakePhoto: 'Reprendre la photo',
      liveCameraAccessibilityLabel: 'Aper\u00e7u en direct de la cam\u00e9ra arri\u00e8re',
      liveCameraAccessibilityHint: 'Cadrez le nid-de-poule et restez dans un endroit s\u00fbr.',
      captureAccessibilityLabel: 'Prendre une photo du nid-de-poule',
      captureAccessibilityHint: 'Prend une photo des dommages routiers.',
      retakePhotoAccessibilityLabel: 'Reprendre la photo du nid-de-poule',
      retakePhotoAccessibilityHint: "Supprime la photo actuelle et rouvre l'appareil photo.",
      continueWithPhotoAccessibilityLabel: 'Continuer avec cette photo',
      continueWithPhotoAccessibilityHint: "Continue vers la confirmation de l'emplacement.",
    },
    location: {
      step: '\u00c9tape 2 sur 3',
      title: "Confirmez l'emplacement",
      description: "Assurez-vous que l'\u00e9pingle est sur le nid-de-poule.",
      permissionLoadingTitle: "V\u00e9rification de l'acc\u00e8s \u00e0 votre position",
      permissionLoadingDescription: 'Veuillez patienter un instant.',
      permissionUnavailableTitle: "Acc\u00e8s \u00e0 votre position indisponible",
      permissionUnavailableDescription:
        "Nous ne pouvons pas v\u00e9rifier l'acc\u00e8s \u00e0 votre position pour le moment. R\u00e9essayez.",
      permissionRequiredTitle: "Acc\u00e8s \u00e0 votre position requis",
      permissionRequiredDescription:
        'Pothole MTL utilise votre position pour d\u00e9terminer o\u00f9 se trouve le nid-de-poule signal\u00e9.',
      allowLocationAccess: "Autoriser l'acc\u00e8s \u00e0 votre position",
      requestingLocationAccess: "Demande d'acc\u00e8s \u00e0 votre position\u2026",
      allowLocationAccessAccessibilityLabel: "Autoriser l'acc\u00e8s \u00e0 votre position",
      allowLocationAccessAccessibilityHint:
        "Ouvre la demande d'autorisation de l'iPhone afin que Pothole MTL puisse trouver ce nid-de-poule.",
      permissionDeniedTitle: "Acc\u00e8s \u00e0 votre position refus\u00e9",
      permissionDeniedDescription:
        "Autorisez l'acc\u00e8s \u00e0 votre position pour d\u00e9terminer o\u00f9 se trouve ce nid-de-poule.",
      retryPermission: 'R\u00e9essayer',
      retryPermissionAccessibilityLabel: "R\u00e9essayer l'autorisation de localisation",
      retryPermissionAccessibilityHint:
        "Ouvre la demande d'autorisation de l'iPhone afin que Pothole MTL puisse trouver ce nid-de-poule.",
      permissionPermanentlyDeniedTitle: "Activez l'acc\u00e8s \u00e0 votre position dans R\u00e9glages",
      permissionPermanentlyDeniedDescription:
        'Pour trouver ce nid-de-poule, activez la localisation pour Pothole MTL dans les R\u00e9glages de votre iPhone.',
      locationServicesDisabledTitle: 'Activez le service de localisation',
      locationServicesDisabledDescription:
        'Activez le service de localisation dans les R\u00e9glages de votre iPhone, puis r\u00e9essayez.',
      openSettings: 'Ouvrir R\u00e9glages',
      openSettingsAccessibilityLabel: 'Ouvrir R\u00e9glages',
      openSettingsAccessibilityHint: 'Ouvre les r\u00e9glages de Pothole MTL sur votre iPhone.',
      findingLocationTitle: 'Recherche de votre position\u2026',
      findingLocationDescription: "Cela peut prendre quelques instants, surtout \u00e0 l'int\u00e9rieur.",
      locationFailureTitle: 'Impossible de trouver votre position',
      locationFailureDescription:
        'V\u00e9rifiez que le service de localisation est activ\u00e9, puis r\u00e9essayez.',
      tryAgain: 'R\u00e9essayer',
      tryAgainAccessibilityLabel: 'Essayer de trouver de nouveau votre position',
      tryAgainAccessibilityHint: 'Essaie de trouver de nouveau votre position actuelle.',
      refreshingLocationTitle: "Actualisation de la position\u2026",
      adjustPinInstruction: "Faites glisser l'\u00e9pingle jusqu'au nid-de-poule exact au besoin.",
      potholeLocation: 'Emplacement du nid-de-poule',
      findingAddress: "Recherche de l'adresse\u2026",
      addressUnavailableTitle: 'Adresse introuvable',
      addressUnavailableDescription: "Vous pouvez tout de m\u00eame continuer avec l'emplacement \u00e9pingl\u00e9.",
      locationSetFromGps: 'Emplacement d\u00e9fini par GPS',
      pinAdjustedManually: '\u00c9pingle d\u00e9plac\u00e9e manuellement',
      accuracy: (metres) => `Pr\u00e9cision : \u00b1${metres} m`,
      originalGpsAccuracy: (metres) => `Pr\u00e9cision GPS initiale : \u00b1${metres} m`,
      mapAccessibilityLabel: "Carte montrant l'emplacement s\u00e9lectionn\u00e9 du nid-de-poule",
      mapAccessibilityHint: "Faites glisser l'\u00e9pingle du nid-de-poule pour corriger sa position.",
      potholePinAccessibilityLabel: "\u00c9pingle de l'emplacement du nid-de-poule",
      potholePinAccessibilityHint:
        "Faites glisser l'\u00e9pingle jusqu'au nid-de-poule exact. L'adresse est mise \u00e0 jour lorsque vous la rel\u00e2chez.",
      refreshLocation: 'Actualiser la position',
      refreshLocationAccessibilityLabel: 'Actualiser la position',
      refreshLocationAccessibilityHint: 'Recherche de nouveau une position actuelle unique.',
      continueWithLocationAccessibilityLabel: 'Continuer avec cet emplacement',
      continueWithLocationAccessibilityHint: 'Continuer vers les d\u00e9tails du nid-de-poule.',
      checkingNearbyReports: 'V\u00e9rification des signalements \u00e0 proximit\u00e9\u2026',
      nearbyCheckErrorTitle: 'Impossible de v\u00e9rifier les signalements \u00e0 proximit\u00e9',
      nearbyCheckErrorDescription:
        'Votre signalement est toujours l\u00e0. R\u00e9essayez ou continuez sans v\u00e9rifier.',
      retryNearbyCheck: 'R\u00e9essayer',
      continueWithoutNearbyCheck: 'Continuer sans v\u00e9rifier',
    },
    nearby: {
      title: 'D\u00e9j\u00e0 signal\u00e9 \u00e0 proximit\u00e9\u00a0?',
      description:
        'Nous avons trouv\u00e9 des nids-de-poule pr\u00e8s de cet emplacement. V\u00e9rifiez si l\'un d\'eux est le m\u00eame nid-de-poule.',
      distance: (metres) => `\u00e0 ${metres} m`,
      samePotholeAction: 'C\'est le m\u00eame nid-de-poule',
      noneOfTheseAction: 'Aucun d\u2019entre eux \u2014 signaler un nouveau nid-de-poule',
    },
    details: {
      step: '\u00c9tape 3 sur 3',
      title: 'Quelle est sa gravit\u00e9\u00a0?',
      description:
        "Choisissez l'option qui convient le mieux. Vous pouvez aussi ajouter une courte note.",
      severity: {
        small: {
          label: 'Petit',
          description: 'Dommages mineurs \u00e0 la surface',
        },
        medium: {
          label: 'Moyen',
          description: 'Impact perceptible pendant la conduite',
        },
        large: {
          label: 'Important / dangereux',
          description: 'Profond, large ou potentiellement dangereux',
        },
      },
      optionalNote: 'Note facultative',
      notePlaceholder: 'Exemple\u00a0: nid-de-poule profond dans la voie de droite',
      reviewAction: 'V\u00e9rifier le signalement',
    },
    review: {
      title: 'V\u00e9rifiez votre signalement',
      photo: 'Photo',
      photoRequired: 'Une photo est requise avant d\u2019envoyer votre signalement.',
      location: 'Emplacement',
      locationRequired: "Un emplacement est requis avant l'envoi de votre signalement.",
      severity: 'Gravit\u00e9',
      note: 'Note',
      submitAction: 'Envoyer le signalement',
      submittingAction: 'Envoi en cours\u2026',
      preparingReport: 'Pr\u00e9paration du signalement\u2026',
      uploadingPhoto: 'T\u00e9l\u00e9versement de la photo\u2026',
      savingReport: 'Enregistrement du signalement\u2026',
      submissionErrorTitle: 'Impossible d\u2019envoyer votre signalement',
      submissionErrorDescription: 'Vos renseignements sont toujours l\u00e0. R\u00e9essayez.',
      photoTooLargeTitle: 'Photo trop volumineuse',
      photoTooLargeDescription: 'Prenez une autre photo de 10 Mo ou moins, puis r\u00e9essayez.',
      photoInvalidTitle: 'Impossible d\u2019utiliser cette photo',
      photoInvalidDescription: 'Reprenez la photo, puis r\u00e9essayez.',
      photoUploadErrorTitle: 'Impossible de t\u00e9l\u00e9verser votre photo',
      photoUploadErrorDescription: 'Les renseignements de votre signalement sont toujours l\u00e0. R\u00e9essayez.',
      addingToExistingPothole: 'Ajout \u00e0 un nid-de-poule existant',
      existingPotholeUnavailableTitle: 'Ce nid-de-poule \u00e0 proximit\u00e9 n\'est plus disponible',
      existingPotholeUnavailableDescription:
        'V\u00e9rifiez de nouveau les signalements \u00e0 proximit\u00e9 avant l\'envoi.',
      checkNearbyAgainAction: 'V\u00e9rifier de nouveau les signalements \u00e0 proximit\u00e9',
      retryAction: 'R\u00e9essayer',
    },
    success: {
      title: 'Signalement re\u00e7u',
      description: 'Merci de contribuer \u00e0 am\u00e9liorer les routes de Montr\u00e9al.',
      reference: (id) => `Nid-de-poule n\u00b0\u00a0${id}`,
      existingPotholeDescription: 'Votre signalement a \u00e9t\u00e9 ajout\u00e9 \u00e0 un nid-de-poule existant.',
      reportCount: (count) => (count === 1 ? '1 signalement' : `${count} signalements`),
      statusLabel: 'Statut',
      statusDescription: 'Nous vous tiendrons au courant lorsque le statut changera.',
      viewReportAction: 'Voir le signalement',
    },
    reportStatus: {
      title: 'Statut du signalement',
      description: "Votre signalement a \u00e9t\u00e9 re\u00e7u et attend d'\u00eatre examin\u00e9.",
      existingPotholeDescription:
        'Votre signalement a \u00e9t\u00e9 ajout\u00e9 \u00e0 un nid-de-poule existant. Son statut actuel est indiqu\u00e9 ci-dessous.',
      receivedLabel: 'Signalement re\u00e7u',
      existingPotholeStatusLabel: 'Statut actuel du nid-de-poule',
    },
    submissionStatuses: {
      REPORTED: 'Signal\u00e9',
      UNDER_REVIEW: 'En cours d\u2019examen',
      VERIFIED: 'V\u00e9rifi\u00e9',
      ASSIGNED: 'Affect\u00e9',
      ACCEPTED: 'Accept\u00e9',
      IN_PROGRESS: 'En cours',
      REPAIRED: 'R\u00e9par\u00e9',
      REJECTED: 'Rejet\u00e9',
      DUPLICATE: 'Doublon',
    },
    map: {
      title: 'Nids-de-poule signal\u00e9s',
      description: 'Explorez les nids-de-poule signal\u00e9s dans la zone visible.',
      mapAccessibilityLabel: 'Carte des nids-de-poule signal\u00e9s',
      mapAccessibilityHint: 'D\u00e9placez la carte pour charger les nids-de-poule dans la zone visible.',
      loading: 'Chargement des nids-de-poule signal\u00e9s\u2026',
      refreshing: 'Actualisation de la carte\u2026',
      emptyViewport: 'Aucun nid-de-poule signal\u00e9 dans cette zone.',
      loadErrorTitle: 'Impossible de charger les nids-de-poule pour le moment.',
      loadErrorDescription: 'Veuillez r\u00e9essayer.',
      retryAction: 'R\u00e9essayer',
      resultLimitReached: 'Il y a trop de nids-de-poule dans cette zone. Zoomez pour en voir plus.',
      potholeTitle: (publicId) => `Nid-de-poule ${publicId}`,
      markerAccessibilityLabel: (publicId, status) => `Nid-de-poule ${publicId}. ${status}.`,
      addressUnavailable: 'Adresse indisponible',
      statusLabel: 'Statut',
      severityLabel: 'Gravit\u00e9',
      reportCount: (count) => (count === 1 ? '1 signalement' : `${count} signalements`),
      severity: {
        SMALL: 'Petit',
        MEDIUM: 'Moyen',
        DANGEROUS: 'Dangereux',
      },
    },
  },
} satisfies Record<AppLocale, MessageCatalog>;
