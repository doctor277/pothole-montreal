import { StorageApiError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CitizenReportSubmissionError, submitCitizenReport } from '@/src/services/report-submission';
import type { ReportDraft, ReportSubmissionAttempt } from '@/src/types/report';

const mocks = vi.hoisted(() => ({
  ensureAnonymousSession: vi.fn(),
  functionInvoke: vi.fn(),
  storageFrom: vi.fn(),
  uploadToSignedUrl: vi.fn(),
}));

vi.mock('expo-file-system', () => ({
  File: class TestFile {
    readonly exists = true;
    readonly size = 3;
    readonly type = 'image/jpeg';

    async arrayBuffer(): Promise<ArrayBuffer> {
      return new Uint8Array([0xff, 0xd8, 0xff]).buffer;
    }
  },
}));

vi.mock('@/src/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: mocks.functionInvoke,
    },
    storage: {
      from: mocks.storageFrom,
    },
  },
}));

vi.mock('@/src/services/anonymous-session', () => ({
  ensureAnonymousSession: mocks.ensureAnonymousSession,
}));

const preparedAttempt: ReportSubmissionAttempt = {
  submissionId: '11111111-1111-4111-8111-111111111111',
  storagePath: 'submissions/user/11111111-1111-4111-8111-111111111111.jpg',
};

const preparedUpload = {
  ...preparedAttempt,
  uploadToken: 'short-lived-upload-token',
  replacedPreviousAttempt: false,
};

const submittedResponse = {
  potholeId: '22222222-2222-4222-8222-222222222222',
  reportId: '33333333-3333-4333-8333-333333333333',
  publicId: 'MTL-000001',
  status: 'REPORTED',
  matchedExisting: false,
  reportCount: 1,
};

const draft: ReportDraft = {
  photoUri: 'file://report-photo.jpg',
  location: {
    latitude: 45.5017,
    longitude: -73.5673,
    accuracy: 8,
    source: 'gps',
    address: null,
  },
  nearbyCandidates: null,
  selectedExistingPothole: null,
  severity: 'medium',
  note: 'Large pothole near the curb.',
};

describe('submitCitizenReport', () => {
  beforeEach(() => {
    mocks.ensureAnonymousSession.mockResolvedValue(undefined);
    mocks.storageFrom.mockReturnValue({ uploadToSignedUrl: mocks.uploadToSignedUrl });
    mocks.functionInvoke.mockImplementation((functionName: string) => {
      if (functionName === 'prepare-report-upload') {
        return Promise.resolve({ data: preparedUpload, error: null });
      }

      if (functionName === 'submit-pothole-report') {
        return Promise.resolve({ data: submittedResponse, error: null });
      }

      throw new Error(`Unexpected function invocation: ${functionName}`);
    });
    mocks.uploadToSignedUrl.mockResolvedValue({ data: { path: preparedAttempt.storagePath }, error: null });
  });

  it('stops a definite signed-upload rejection before finalization and retains the attempt', async () => {
    const stages: string[] = [];
    mocks.uploadToSignedUrl.mockResolvedValue({
      data: null,
      error: new StorageApiError('Signed upload is forbidden', 403, 'AccessDenied'),
    });

    await expect(
      submitCitizenReport({
        draft,
        existingAttempt: null,
        onStage: (stage) => stages.push(stage),
      }),
    ).rejects.toMatchObject({
      kind: 'photoUpload',
      attempt: preparedAttempt,
    } satisfies Partial<CitizenReportSubmissionError>);

    expect(mocks.functionInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.functionInvoke).toHaveBeenCalledWith('prepare-report-upload', { body: {} });
    expect(stages).toEqual(['preparing', 'uploading']);
  });

  it('finalizes after a successful upload and returns only the safe mobile result', async () => {
    const onAttemptReady = vi.fn();
    const result = await submitCitizenReport({
      draft,
      existingAttempt: null,
      onAttemptReady,
    });

    expect(onAttemptReady).toHaveBeenCalledWith(preparedAttempt);
    expect(mocks.functionInvoke).toHaveBeenNthCalledWith(2, 'submit-pothole-report', {
      body: expect.objectContaining({
        submission_id: preparedAttempt.submissionId,
        storage_path: preparedAttempt.storagePath,
      }),
    });
    expect(result).toEqual({
      attempt: preparedAttempt,
      report: {
        publicId: 'MTL-000001',
        status: 'REPORTED',
        matchedExisting: false,
        reportCount: 1,
      },
    });
  });

  it('uses finalization once for an ambiguous upload conflict on the same retry identity', async () => {
    mocks.uploadToSignedUrl.mockResolvedValue({
      data: null,
      error: new StorageApiError('Object already exists', 409, 'ResourceAlreadyExists'),
    });

    const result = await submitCitizenReport({
      draft,
      existingAttempt: preparedAttempt,
    });

    expect(mocks.functionInvoke).toHaveBeenNthCalledWith(1, 'prepare-report-upload', {
      body: { submission_id: preparedAttempt.submissionId },
    });
    expect(mocks.functionInvoke).toHaveBeenNthCalledWith(2, 'submit-pothole-report', {
      body: expect.objectContaining({
        submission_id: preparedAttempt.submissionId,
        storage_path: preparedAttempt.storagePath,
      }),
    });
    expect(result.attempt).toEqual(preparedAttempt);
  });

  it('keeps an unknown transport failure on the idempotent finalization path', async () => {
    mocks.uploadToSignedUrl.mockRejectedValue(new Error('network interrupted'));

    await submitCitizenReport({
      draft,
      existingAttempt: preparedAttempt,
    });

    expect(mocks.functionInvoke).toHaveBeenCalledTimes(2);
    expect(mocks.functionInvoke).toHaveBeenLastCalledWith('submit-pothole-report', {
      body: expect.objectContaining({
        submission_id: preparedAttempt.submissionId,
        storage_path: preparedAttempt.storagePath,
      }),
    });
  });
});
