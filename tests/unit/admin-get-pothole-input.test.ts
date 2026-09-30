import { describe, expect, it } from 'vitest';

import {
  InvalidAdminDetailInputError,
  parseAdminGetPotholeInput,
} from '../../supabase/functions/_shared/admin-get-pothole-input';

describe('admin-get-pothole request parsing', () => {
  it('accepts the canonical public pothole ID through the production parser', () => {
    expect(parseAdminGetPotholeInput({ publicId: 'MTL-000003' })).toBe('MTL-000003');
  });

  it.each([
    { publicId: 'MTL-00003' },
    { publicId: 'MTL-0000030' },
    { publicId: 'TOR-000003' },
    { publicId: 'MTL-000003 ' },
    { publicId: 'MTL-000003/extra' },
    { publicId: 3 },
    { publicId: 'MTL-000003', extra: true },
    null,
  ])('rejects a malformed admin-get-pothole request', (input) => {
    expect(() => parseAdminGetPotholeInput(input)).toThrow(InvalidAdminDetailInputError);
  });
});
