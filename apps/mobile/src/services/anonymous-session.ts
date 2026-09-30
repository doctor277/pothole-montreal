import { supabase } from '@/src/lib/supabase';

type AnonymousSessionState = 'unknown' | 'present' | 'absent';

let anonymousSessionState: AnonymousSessionState = 'unknown';
let ensureSessionPromise: Promise<void> | null = null;
let recoverSessionPromise: Promise<boolean> | null = null;

// The Supabase client is a process-wide singleton. Keep only the presence of a
// local session in memory, never a user object or any credential. Auth state
// changes also cover automatic token refreshes and a later signed-out state.
supabase.auth.onAuthStateChange((_event, session) => {
  anonymousSessionState = session ? 'present' : 'absent';
});

export class AnonymousSessionError extends Error {
  constructor() {
    super('Unable to establish an anonymous Supabase session.');
    this.name = 'AnonymousSessionError';
  }
}

// Reuse the persisted anonymous session for every protected citizen API. On a
// mobile client, getSession is the efficient local-session path; the protected
// Edge Function remains the authority that validates the JWT remotely.
export function ensureAnonymousSession(): Promise<void> {
  if (anonymousSessionState === 'present') {
    return Promise.resolve();
  }

  if (ensureSessionPromise) {
    return ensureSessionPromise;
  }

  const promise = establishAnonymousSession();
  ensureSessionPromise = promise;
  void promise.then(
    () => clearEnsureSessionPromise(promise),
    () => clearEnsureSessionPromise(promise),
  );

  return promise;
}

// A protected read can reach the server with a just-expired or invalidated JWT
// despite normal auto-refresh. Refresh once, then establish a new anonymous
// session only if the client truly has no session left. A still-present failed
// session is not silently replaced so an in-flight report cannot change owner.
export function recoverAnonymousSessionAfterAuthFailure(): Promise<boolean> {
  if (recoverSessionPromise) {
    return recoverSessionPromise;
  }

  const promise = recoverAnonymousSession();
  recoverSessionPromise = promise;
  void promise.then(
    () => clearRecoverSessionPromise(promise),
    () => clearRecoverSessionPromise(promise),
  );

  return promise;
}

async function establishAnonymousSession(): Promise<void> {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      throw new AnonymousSessionError();
    }

    if (session) {
      anonymousSessionState = 'present';
      return;
    }

    const { data, error } = await supabase.auth.signInAnonymously();

    if (error || !data.session || !data.user) {
      anonymousSessionState = 'absent';
      throw new AnonymousSessionError();
    }

    anonymousSessionState = 'present';
  } catch (error) {
    if (error instanceof AnonymousSessionError) {
      throw error;
    }

    throw new AnonymousSessionError();
  }
}

async function recoverAnonymousSession(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.refreshSession();

    if (!error && data.session) {
      anonymousSessionState = 'present';
      return true;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || session) {
      if (session) {
        anonymousSessionState = 'present';
      }

      return false;
    }

    anonymousSessionState = 'absent';
    await ensureAnonymousSession();
    return true;
  } catch {
    return false;
  }
}

function clearEnsureSessionPromise(promise: Promise<void>): void {
  if (ensureSessionPromise === promise) {
    ensureSessionPromise = null;
  }
}

function clearRecoverSessionPromise(promise: Promise<boolean>): void {
  if (recoverSessionPromise === promise) {
    recoverSessionPromise = null;
  }
}
