import { describe, expect, it } from 'vitest';

import {
  InvalidAdminTransitionInputError,
  parseAdminTransitionInput,
  toAdminTransitionResponse,
  toTransitionResult,
} from '../../supabase/functions/_shared/admin-moderation-contract';

describe('admin moderation request contract', () => {
  it('accepts supported transition targets and a trimmed rejection reason', () => {
    expect(
      parseAdminTransitionInput({
        publicId: 'MTL-000001',
        targetStatus: 'UNDER_REVIEW',
        reason: null,
      }),
    ).toEqual({ publicId: 'MTL-000001', targetStatus: 'UNDER_REVIEW', reason: null });

    expect(
      parseAdminTransitionInput({
        publicId: 'MTL-000001',
        targetStatus: 'VERIFIED',
        reason: null,
      }),
    ).toEqual({ publicId: 'MTL-000001', targetStatus: 'VERIFIED', reason: null });

    expect(
      parseAdminTransitionInput({
        publicId: 'MTL-000001',
        targetStatus: 'REJECTED',
        reason: '  Not a road defect  ',
      }),
    ).toEqual({
      publicId: 'MTL-000001',
      targetStatus: 'REJECTED',
      reason: 'Not a road defect',
    });
  });

  it.each([
    { publicId: 'MTL-000001', targetStatus: 'REJECTED', reason: null },
    { publicId: 'MTL-000001', targetStatus: 'REJECTED', reason: '   ' },
    { publicId: 'MTL-000001', targetStatus: 'UNDER_REVIEW', reason: 'not allowed here' },
    { publicId: 'MTL-000001', targetStatus: 'REPAIRED', reason: null },
    { publicId: 'bad-id', targetStatus: 'UNDER_REVIEW', reason: null },
    {
      publicId: 'MTL-000001',
      targetStatus: 'REJECTED',
      reason: 'x'.repeat(501),
    },
    {
      publicId: 'MTL-000001',
      targetStatus: 'UNDER_REVIEW',
      reason: null,
      actorUserId: 'browser-supplied-field-is-rejected',
    },
  ])('rejects invalid browser transition input %#', (input) => {
    expect(() => parseAdminTransitionInput(input)).toThrow(InvalidAdminTransitionInputError);
  });
});

describe('admin moderation response contract', () => {
  it('maps a stale database transition to a safe conflict response', async () => {
    const result = toTransitionResult([
      {
        outcome: 'INVALID_TRANSITION',
        public_id: 'MTL-000001',
        from_status: 'UNDER_REVIEW',
        to_status: 'UNDER_REVIEW',
        updated_at: null,
      },
    ]);

    expect(result).not.toBeNull();
    const response = toAdminTransitionResponse(result!);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'status_conflict' });
  });

  it.each([
    ['NOT_FOUND', 404, 'not_found'],
    ['INVALID_INPUT', 400, 'invalid_request'],
    ['ACTOR_NOT_AUTHORIZED', 403, 'forbidden'],
  ] as const)('maps %s to the expected safe response', async (outcome, status, error) => {
    const result = toTransitionResult([
      {
        outcome,
        public_id: null,
        from_status: null,
        to_status: null,
        updated_at: null,
      },
    ]);

    expect(result).not.toBeNull();
    const response = toAdminTransitionResponse(result!);
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('returns the updated public DTO only for a fully valid database result', async () => {
    const result = toTransitionResult([
      {
        outcome: 'UPDATED',
        public_id: 'MTL-000001',
        from_status: 'REPORTED',
        to_status: 'UNDER_REVIEW',
        updated_at: '2026-09-01T12:00:00.000Z',
      },
    ]);

    expect(result).not.toBeNull();
    const response = toAdminTransitionResponse(result!);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      pothole: {
        publicId: 'MTL-000001',
        fromStatus: 'REPORTED',
        status: 'UNDER_REVIEW',
        updatedAt: '2026-09-01T12:00:00.000Z',
      },
    });
  });

  it('rejects a malformed RPC row instead of exposing it to the browser', () => {
    expect(
      toTransitionResult([
        {
          outcome: 'UPDATED',
          public_id: 'MTL-000001',
          from_status: 'REPORTED',
          to_status: 'UNDER_REVIEW',
          updated_at: 'not-a-timestamp',
        },
      ]),
    ).toBeNull();
  });
});
