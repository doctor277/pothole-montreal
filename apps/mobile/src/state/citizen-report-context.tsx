import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { defaultLocale, type AppLocale } from '@/src/i18n/messages';
import type {
  ReportAddress,
  ReportDraft,
  ReportLocation,
  ReportSubmissionAttempt,
  Severity,
  SubmittedReport,
} from '@/src/types/report';
import type { NearbyPotholeCandidate } from '@/src/types/nearby-pothole';

type CitizenReportContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  draft: ReportDraft;
  submissionAttempt: ReportSubmissionAttempt | null;
  setSubmissionAttempt: (attempt: ReportSubmissionAttempt | null) => void;
  submittedReport: SubmittedReport | null;
  setSubmittedReport: (report: SubmittedReport | null) => void;
  setCapturedPhoto: (photoUri: string) => void;
  clearCapturedPhoto: () => void;
  setCapturedLocation: (location: ReportLocation) => void;
  setLocationAddress: (
    coordinates: Pick<ReportLocation, 'latitude' | 'longitude'>,
    address: ReportAddress | null,
  ) => void;
  setNearbyCandidates: (candidates: readonly NearbyPotholeCandidate[] | null) => void;
  selectExistingPothole: (candidate: NearbyPotholeCandidate) => void;
  chooseNewPothole: () => void;
  clearNearbyPotholeDecision: () => void;
  setSeverity: (severity: Severity) => void;
  setNote: (note: string) => void;
  resetReport: () => void;
};

const createEmptyDraft = (): ReportDraft => ({
  photoUri: null,
  location: null,
  nearbyCandidates: null,
  selectedExistingPothole: null,
  severity: null,
  note: '',
});

const CitizenReportContext = createContext<CitizenReportContextValue | undefined>(undefined);

export function CitizenReportProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(defaultLocale);
  const [draft, setDraft] = useState<ReportDraft>(createEmptyDraft);
  const [submissionAttempt, setSubmissionAttempt] = useState<ReportSubmissionAttempt | null>(null);
  const [submittedReport, setSubmittedReport] = useState<SubmittedReport | null>(null);

  const setCapturedPhoto = useCallback((photoUri: string) => {
    setDraft((currentDraft) => ({ ...currentDraft, photoUri }));
    // A new JPEG must receive a new server-selected non-upsert path. Ordinary
    // retries keep their attempt; only replacing/removing the photo clears it.
    setSubmissionAttempt(null);
    setSubmittedReport(null);
  }, []);

  const clearCapturedPhoto = useCallback(() => {
    setDraft((currentDraft) => ({ ...currentDraft, photoUri: null }));
    setSubmissionAttempt(null);
    setSubmittedReport(null);
  }, []);

  const setCapturedLocation = useCallback((location: ReportLocation) => {
    setDraft((currentDraft) => {
      const locationChanged =
        !currentDraft.location ||
        currentDraft.location.latitude !== location.latitude ||
        currentDraft.location.longitude !== location.longitude;

      return {
        ...currentDraft,
        location,
        ...(locationChanged
          ? {
              nearbyCandidates: null,
              selectedExistingPothole: null,
            }
          : {}),
      };
    });
  }, []);

  const setLocationAddress = useCallback(
    (
      coordinates: Pick<ReportLocation, 'latitude' | 'longitude'>,
      address: ReportAddress | null,
    ) => {
      setDraft((currentDraft) => {
        const currentLocation = currentDraft.location;

        if (
          !currentLocation ||
          currentLocation.latitude !== coordinates.latitude ||
          currentLocation.longitude !== coordinates.longitude
        ) {
          return currentDraft;
        }

        return {
          ...currentDraft,
          location: {
            ...currentLocation,
            address,
          },
        };
      });
    },
    [],
  );

  const setSeverity = useCallback((severity: Severity) => {
    setDraft((currentDraft) => ({ ...currentDraft, severity }));
  }, []);

  const setNearbyCandidates = useCallback((candidates: readonly NearbyPotholeCandidate[] | null) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      nearbyCandidates: candidates,
      selectedExistingPothole: null,
    }));
  }, []);

  const selectExistingPothole = useCallback((candidate: NearbyPotholeCandidate) => {
    setDraft((currentDraft) => {
      const isCurrentCandidate = currentDraft.nearbyCandidates?.some(
        (nearbyCandidate) => nearbyCandidate.publicId === candidate.publicId,
      );

      return isCurrentCandidate
        ? {
            ...currentDraft,
            selectedExistingPothole: candidate,
          }
        : currentDraft;
    });
  }, []);

  const chooseNewPothole = useCallback(() => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      nearbyCandidates: null,
      selectedExistingPothole: null,
    }));
  }, []);

  const clearNearbyPotholeDecision = useCallback(() => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      nearbyCandidates: null,
      selectedExistingPothole: null,
    }));
  }, []);

  const setNote = useCallback((note: string) => {
    setDraft((currentDraft) => ({ ...currentDraft, note }));
  }, []);

  const resetReport = useCallback(() => {
    setDraft(createEmptyDraft());
    setSubmissionAttempt(null);
    setSubmittedReport(null);
  }, []);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      draft,
      submissionAttempt,
      setSubmissionAttempt,
      submittedReport,
      setSubmittedReport,
      setCapturedPhoto,
      clearCapturedPhoto,
      setCapturedLocation,
      setLocationAddress,
      setNearbyCandidates,
      selectExistingPothole,
      chooseNewPothole,
      clearNearbyPotholeDecision,
      setSeverity,
      setNote,
      resetReport,
    }),
    [
      draft,
      locale,
      resetReport,
      submissionAttempt,
      submittedReport,
      clearCapturedPhoto,
      chooseNewPothole,
      clearNearbyPotholeDecision,
      setNote,
      setCapturedLocation,
      setLocationAddress,
      setNearbyCandidates,
      selectExistingPothole,
      setSeverity,
      setCapturedPhoto,
    ],
  );

  return <CitizenReportContext.Provider value={value}>{children}</CitizenReportContext.Provider>;
}

export function useCitizenReport() {
  const context = useContext(CitizenReportContext);

  if (!context) {
    throw new Error('useCitizenReport must be used within CitizenReportProvider.');
  }

  return context;
}
