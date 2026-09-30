import { describe, expect, it } from 'vitest';
import { aiTriageLabel, matchesAiTriageFilter } from '../../apps/admin/src/lib/ai-triage';
import type { AdminQueueItem } from '../../apps/admin/src/types/admin';
import { evaluatePotholeAiTriage } from '../../supabase/functions/_shared/pothole-ai-triage-policy';

const base: AdminQueueItem = {
  publicId: 'MTL-000003', status: 'REPORTED', formattedAddress: null, latitude: 45.51,
  longitude: -73.57, reportCount: 2, latestSeverity: 'MEDIUM', createdAt: '2026-09-01T00:00:00Z',
  latestReportCreatedAt: null, aiTriageAvailability: 'available',
  aiTriage: evaluatePotholeAiTriage({ assessment: null, evidenceChangedSinceAssessment: false }),
};
const assessment = {
  classification: 'likely_pothole' as const, confidence: 1, photoQuality: 'good' as const,
  suggestedSeverity: 'MEDIUM' as const, inputPhotoCount: 1, model: 'gpt-5.6-terra',
  promptVersion: 'pothole-vision-v1', schemaVersion: 'pothole-assessment-v1',
};
describe('human queue shadow triage presentation and loaded-row filtering', () => {
  it('does not hide absent assessments or supplemental failures in the default view', () => {
    expect(aiTriageLabel(base)).toBe('No AI assessment');
    const unavailable = { ...base, aiTriageAvailability: 'unavailable' as const, aiTriage: null };
    expect(aiTriageLabel(unavailable)).toBe('AI triage unavailable');
    expect(matchesAiTriageFilter(base, 'all')).toBe(true);
    expect(matchesAiTriageFilter(unavailable, 'all')).toBe(true);
    expect(matchesAiTriageFilter(unavailable, 'missing-stale')).toBe(true);
  });
  it('removes stale evidence only from optional high-confidence view', () => {
    const stale = { ...base, aiTriage: evaluatePotholeAiTriage({ assessment, evidenceChangedSinceAssessment: true }) };
    expect(aiTriageLabel(stale)).toBe('Assessment stale');
    expect(matchesAiTriageFilter(stale, 'high-confidence')).toBe(false);
    expect(matchesAiTriageFilter(stale, 'missing-stale')).toBe(true);
    expect(matchesAiTriageFilter(stale, 'all')).toBe(true);
  });
  it.each(['REPORTED', 'VERIFIED', 'REJECTED'] as const)('shows high AI confidence separately from human %s', (status) => {
    const item = { ...base, status, aiTriage: evaluatePotholeAiTriage({ assessment, evidenceChangedSinceAssessment: false }) };
    expect(aiTriageLabel(item)).toBe('High-confidence likely pothole');
    expect(matchesAiTriageFilter(item, 'high-confidence')).toBe(true);
    expect(item.status).toBe(status);
  });
  it('does not reconcile VERIFIED with an AI likely-not-pothole classification', () => {
    const item = { ...base, status: 'VERIFIED' as const, aiTriage: evaluatePotholeAiTriage({
      assessment: { ...assessment, classification: 'unlikely_pothole' }, evidenceChangedSinceAssessment: false,
    }) };
    expect(aiTriageLabel(item)).toBe('Likely not pothole');
    expect(matchesAiTriageFilter(item, 'likely-not')).toBe(true);
    expect(item.status).toBe('VERIFIED');
  });
  it.each([
    [{ confidence: 0.5 }, 'review'], [{ classification: 'uncertain' }, 'uncertain'],
    [{ photoQuality: 'poor' }, 'poor-evidence'],
  ] as const)('filters %o without changing row ordering or status', (override, filter) => {
    const item = { ...base, aiTriage: evaluatePotholeAiTriage({ assessment: { ...assessment, ...override }, evidenceChangedSinceAssessment: false }) };
    const original = [item, base];
    expect(original.filter((row) => matchesAiTriageFilter(row, filter))).toEqual([item]);
    expect(original).toEqual([item, base]);
    expect(item.status).toBe('REPORTED');
  });
});
