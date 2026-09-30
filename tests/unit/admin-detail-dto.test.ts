import { describe, expect, it, vi } from 'vitest';

import { parseAdminDetail, toAdminDetailDto } from '../../supabase/functions/_shared/admin-detail-dto';

const rawDetail = {
  pothole: {
    public_id: 'MTL-000001',
    status: 'REPORTED',
    formatted_address: '1000 Rue Exemple, Montréal, QC H0H 0H0',
    street_number: '1000',
    street: 'Rue Exemple',
    city: 'Montréal',
    district: 'Quartier Exemple',
    region: 'QC',
    postal_code: 'H0H 0H0',
    country: 'CA',
    latitude: 45.5017,
    longitude: -73.5673,
    report_count: 2,
    created_at: '2026-09-01T12:00:00.000Z',
    updated_at: '2026-09-01T12:05:00.000Z',
    repaired_at: null,
    internal_uuid: 'must-not-leak-canonical-id',
  },
  reports: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      severity: 'DANGEROUS',
      note: 'Deep damage beside the curb.',
      latitude: 45.50171,
      longitude: -73.56731,
      accuracy_meters: 6.5,
      formatted_address: '1000 Rue Exemple, Montréal, QC H0H 0H0',
      street_number: '1000',
      street: 'Rue Exemple',
      city: 'Montréal',
      district: 'Quartier Exemple',
      region: 'QC',
      postal_code: 'H0H 0H0',
      country: 'CA',
      matched_existing_pothole: true,
      created_at: '2026-09-01T12:01:00.000Z',
      reporter_user_id: 'must-not-leak-reporter-id',
      submission_id: 'must-not-leak-submission-id',
      access_token: 'must-not-leak-token',
      photos: [
        {
          storage_path: 'submissions/private-user/private-submission.jpg',
          mime_type: 'image/jpeg',
          file_size_bytes: 1234,
          created_at: '2026-09-01T12:01:01.000Z',
          service_role: 'must-not-leak-service-role',
        },
      ],
    },
  ],
  status_events: [
    {
      from_status: 'REPORTED',
      to_status: 'UNDER_REVIEW',
      reason: null,
      created_at: '2026-09-01T12:02:00.000Z',
      actor_user_id: 'must-not-leak-actor-id',
    },
  ],
};

describe('admin detail DTO boundary', () => {
  it('returns persisted addresses while allowlisting only safe browser fields', async () => {
    const detail = parseAdminDetail(rawDetail);
    expect(detail).not.toBeNull();

    const signPhoto = vi.fn().mockResolvedValue({
      mimeType: 'image/jpeg',
      fileSizeBytes: 1234,
      createdAt: '2026-09-01T12:01:01.000Z',
      available: true,
      signedUrl: 'https://example.test/signed/photo-token',
      expiresInSeconds: 300,
    });

    const dto = await toAdminDetailDto(detail!, signPhoto);

    expect(dto.pothole.address.formattedAddress).toBe('1000 Rue Exemple, Montréal, QC H0H 0H0');
    expect(dto.reports[0].address.formattedAddress).toBe('1000 Rue Exemple, Montréal, QC H0H 0H0');
    expect(signPhoto).toHaveBeenCalledWith({
      storage_path: 'submissions/private-user/private-submission.jpg',
      mime_type: 'image/jpeg',
      file_size_bytes: 1234,
      created_at: '2026-09-01T12:01:01.000Z',
    });

    expect(Object.keys(dto.pothole).sort()).toEqual([
      'address',
      'createdAt',
      'latitude',
      'longitude',
      'publicId',
      'repairedAt',
      'reportCount',
      'status',
      'updatedAt',
    ]);
    expect(Object.keys(dto.reports[0]).sort()).toEqual([
      'accuracyMeters',
      'address',
      'createdAt',
      'id',
      'latitude',
      'longitude',
      'matchedExistingPothole',
      'note',
      'photos',
      'severity',
    ]);
    expect(Object.keys(dto.reports[0].photos[0]).sort()).toEqual([
      'available',
      'createdAt',
      'expiresInSeconds',
      'fileSizeBytes',
      'mimeType',
      'signedUrl',
    ]);

    const serialized = JSON.stringify(dto);
    for (const forbiddenValue of [
      'private-user',
      'private-submission',
      'must-not-leak-reporter-id',
      'must-not-leak-submission-id',
      'must-not-leak-token',
      'must-not-leak-service-role',
      'must-not-leak-actor-id',
      'must-not-leak-canonical-id',
    ]) {
      expect(serialized).not.toContain(forbiddenValue);
    }
  });

  it('rejects a malformed private storage path before any URL can be signed', () => {
    const malformed = structuredClone(rawDetail);
    malformed.reports[0].photos[0].storage_path = '/../unsafe.jpg';

    expect(parseAdminDetail(malformed)).toBeNull();
  });
});
