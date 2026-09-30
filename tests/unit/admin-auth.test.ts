import { describe, expect, it, vi } from 'vitest';

import {
  AdminAuthorizationError,
  requireActiveAdmin,
  toAdminAuthorizationResponse,
} from '../../supabase/functions/_shared/admin-auth';

type UserResult = {
  data: { user: unknown | null };
  error: unknown | null;
};

function createContext(input: {
  userResult: UserResult;
  membership: { data: unknown; error: unknown | null };
}) {
  const getUser = vi.fn().mockResolvedValue(input.userResult);
  const maybeSingle = vi.fn().mockResolvedValue(input.membership);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  return {
    context: {
      supabase: { auth: { getUser } },
      supabaseAdmin: { from },
    } as never,
    getUser,
    from,
  };
}

describe('requireActiveAdmin', () => {
  it('returns 401 when the request has no validated user', async () => {
    const fake = createContext({
      userResult: { data: { user: null }, error: null },
      membership: { data: { is_active: true }, error: null },
    });

    await expect(requireActiveAdmin(fake.context)).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('rejects an anonymous user before checking the administrator allowlist', async () => {
    const fake = createContext({
      userResult: {
        data: { user: { id: 'user-1', is_anonymous: true, email: null } },
        error: null,
      },
      membership: { data: { is_active: true }, error: null },
    });

    await expect(requireActiveAdmin(fake.context)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it('denies an authenticated email user without an active membership', async () => {
    const fake = createContext({
      userResult: {
        data: { user: { id: 'user-2', is_anonymous: false, email: 'operator@example.test' } },
        error: null,
      },
      membership: { data: { is_active: false }, error: null },
    });

    await expect(requireActiveAdmin(fake.context)).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    expect(fake.from).toHaveBeenCalledWith('admin_users');
  });

  it('authorizes only an active email/password administrator', async () => {
    const fake = createContext({
      userResult: {
        data: { user: { id: 'user-3', is_anonymous: false, email: 'admin@example.test' } },
        error: null,
      },
      membership: { data: { is_active: true }, error: null },
    });

    await expect(requireActiveAdmin(fake.context)).resolves.toEqual({
      userId: 'user-3',
      email: 'admin@example.test',
    });
  });

  it('returns a generic 500 response if the server-side membership lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fake = createContext({
      userResult: {
        data: { user: { id: 'user-4', is_anonymous: false, email: 'admin@example.test' } },
        error: null,
      },
      membership: { data: null, error: new Error('database detail must not escape') },
    });

    await expect(requireActiveAdmin(fake.context)).rejects.toMatchObject({
      status: 500,
      code: 'admin_authorization_failed',
    });

    const response = toAdminAuthorizationResponse(
      new AdminAuthorizationError(500, 'admin_authorization_failed'),
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'admin_authorization_failed' });
  });
});
