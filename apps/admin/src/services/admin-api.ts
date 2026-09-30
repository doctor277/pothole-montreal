import { FunctionsHttpError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type {
  AdminAnalyzePotholeResult,
  AdminPotholeDetail,
  AdminQueueCursor,
  AdminQueueResponse,
  AdminTransitionResult,
  AdminTransitionTarget,
  PotholeStatus,
} from "@/types/admin";

export type AdminApiErrorKind =
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "invalid"
  | "ai_disabled"
  | "ai_unavailable"
  | "ai_timeout"
  | "ai_rate_limited"
  | "invalid_ai_response"
  | "no_usable_photos"
  | "pothole_not_found"
  | "unavailable";

export class AdminApiError extends Error {
  constructor(
    readonly kind: AdminApiErrorKind,
    readonly status?: number,
  ) {
    super(kind);
    this.name = "AdminApiError";
  }
}

export type AdminIdentity = {
  authorized: true;
  email: string | null;
};

export const adminApi = {
  async me(): Promise<AdminIdentity> {
    const data = await invoke<unknown>("admin-me", {});

    if (!isRecord(data) || data.authorized !== true || !isNullableString(data.email)) {
      throw new AdminApiError("unavailable");
    }

    return { authorized: true, email: data.email };
  },

  async listPotholes(input: {
    statuses: PotholeStatus[] | null;
    cursor?: AdminQueueCursor | null;
    limit?: number;
  }): Promise<AdminQueueResponse> {
    return invoke<AdminQueueResponse>("admin-list-potholes", {
      statuses: input.statuses,
      cursor: input.cursor ?? null,
      limit: input.limit ?? 25,
    });
  },

  async getPothole(publicId: string): Promise<AdminPotholeDetail> {
    return invoke<AdminPotholeDetail>("admin-get-pothole", { publicId });
  },

  async analyzePothole(publicId: string): Promise<AdminAnalyzePotholeResult> {
    return invoke<AdminAnalyzePotholeResult>("admin-analyze-pothole", { publicId });
  },

  async updatePotholeStatus(input: {
    publicId: string;
    targetStatus: AdminTransitionTarget;
    reason?: string | null;
  }): Promise<AdminTransitionResult> {
    return invoke<AdminTransitionResult>("admin-update-pothole-status", {
      publicId: input.publicId,
      targetStatus: input.targetStatus,
      reason: input.reason ?? null,
    });
  },
};

/**
 * Supabase JavaScript attaches the current signed-in user JWT to function
 * invocations. This service intentionally does not construct Authorization
 * headers, read a service key, or expose internal RPC names to components.
 */
async function invoke<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke<T>(functionName, { body });

  if (error) {
    throw await toAdminApiError(error);
  }

  if (data === null || data === undefined) {
    throw new AdminApiError("unavailable");
  }

  return data;
}

async function toAdminApiError(error: unknown): Promise<AdminApiError> {
  if (!(error instanceof FunctionsHttpError)) {
    return new AdminApiError("unavailable");
  }

  const status = error.context.status;
  const code = await responseErrorCode(error.context);

  if (status === 401) {
    return new AdminApiError("unauthenticated", status);
  }

  if (status === 403) {
    return new AdminApiError("forbidden", status);
  }

  if (code === "ai_unavailable") {
    return new AdminApiError("ai_unavailable", status);
  }

  if (code === "ai_disabled") {
    return new AdminApiError("ai_disabled", status);
  }

  if (code === "ai_timeout") {
    return new AdminApiError("ai_timeout", status);
  }

  if (code === "ai_rate_limited") {
    return new AdminApiError("ai_rate_limited", status);
  }

  if (code === "invalid_ai_response") {
    return new AdminApiError("invalid_ai_response", status);
  }

  if (code === "no_usable_photos") {
    return new AdminApiError("no_usable_photos", status);
  }

  if (code === "pothole_not_found") {
    return new AdminApiError("pothole_not_found", status);
  }

  if (status === 404) {
    return new AdminApiError("not-found", status);
  }

  if (status === 409 || code === "status_conflict") {
    return new AdminApiError("conflict", status);
  }

  if (status === 400) {
    return new AdminApiError("invalid", status);
  }

  return new AdminApiError("unavailable", status);
}

async function responseErrorCode(response: Response): Promise<string | null> {
  try {
    const payload: unknown = await response.clone().json();
    return isRecord(payload) && typeof payload.error === "string" ? payload.error : null;
  } catch {
    return null;
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
