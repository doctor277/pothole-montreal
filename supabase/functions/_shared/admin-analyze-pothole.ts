import {
  AdminAuthorizationError,
  requireActiveAdmin,
  toAdminAuthorizationResponse,
} from './admin-auth.ts';
import { isAiAnalysisEnabled } from './ai-operational-guardrails.ts';
import {
  recordAiOperationalEvent,
  type AiOperationalEvent,
  type AiOperationalEventType,
} from './ai-operational-telemetry.ts';
import {
  InvalidAdminDetailInputError,
  parseAdminGetPotholeInput,
} from './admin-get-pothole-input.ts';
import {
  OPENAI_POTHOLE_MODEL,
  OPENAI_POTHOLE_PROMPT_VERSION,
  OPENAI_POTHOLE_SCHEMA_VERSION,
  OpenAiPotholeAnalysisError,
  analyzePotholePhotos,
  type OpenAiPotholeAnalysisResult,
} from './openai-pothole-analysis.ts';
import {
  parseAdminAiAssessmentSummary,
  type AdminAiAssessmentSummaryDto,
} from './pothole-ai-assessment.ts';
import {
  buildPotholeAutoVerifyShadowDecision,
  isAiAutomationOperationallyEnabled,
} from './pothole-ai-decision-policy.ts';
import { REPORT_PHOTO_BUCKET } from './report-submission.ts';

const MAX_JPEG_BYTES = 10 * 1024 * 1024;
const EVIDENCE_LOAD_TIMEOUT_MS = 30_000;

type AdminAnalyzeContext = Parameters<typeof requireActiveAdmin>[0];

export type AdminAnalyzePotholeDependencies = {
  getAiAnalysisEnabled: () => string | undefined;
  getOpenAiApiKey: () => string | undefined;
  getAiAutomationEnabled?: () => string | undefined;
  analyzePhotos?: typeof analyzePotholePhotos;
  createRequestId?: () => string;
  evidenceLoadTimeoutMs?: number;
};

type EvidencePhoto = {
  photoId: string;
  storagePath: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
};

type BeginResult = {
  outcome:
    | 'READY'
    | 'NOT_FOUND'
    | 'NO_USABLE_PHOTOS'
    | 'ACTOR_NOT_AUTHORIZED'
    | 'ANALYSIS_IN_PROGRESS'
    | 'ALREADY_COMPLETED';
  photos: EvidencePhoto[];
};

type LoadedPhoto = {
  photoId: string;
  byteLength: number;
  contentSha256: string;
  dataUrl: string;
};

export async function handleAdminAnalyzePothole(
  request: Request,
  context: AdminAnalyzeContext,
  dependencies: AdminAnalyzePotholeDependencies,
): Promise<Response> {
  if (request.method !== 'POST') {
    return privateJson({ error: 'method_not_allowed' }, 405);
  }

  let lease: { requestId: string; actorUserId: string } | null = null;
  let providerSucceeded = false;

  try {
    const admin = await requireActiveAdmin(context);
    const publicId = parseAdminGetPotholeInput(await readJsonBody(request));

    // Call Web Crypto through its owning object. Both Node and Web Crypto
    // runtimes brand-check randomUUID(), so detaching the method can throw.
    const requestId = dependencies.createRequestId
      ? dependencies.createRequestId()
      : crypto.randomUUID();

    if (!isUuid(requestId)) {
      console.error('admin-analyze-pothole could not create a request identifier');
      return privateJson({ error: 'ai_unavailable' }, 503);
    }

    const automationEnabledValue = dependencies.getAiAutomationEnabled?.();
    const automationOperationallyEnabled = isAiAutomationOperationallyEnabled(
      automationEnabledValue,
    );

    if (!isAiAnalysisEnabled(dependencies.getAiAnalysisEnabled())) {
      await recordTelemetry(context, {
        publicId,
        requestId,
        eventType: 'analysis_disabled',
        automationOperationallyEnabled,
        actionPerformed: false,
      });
      return privateJson({ error: 'ai_disabled' }, 503);
    }

    const { data: beginData, error: beginError } = await context.supabaseAdmin.rpc(
      'admin_begin_pothole_ai_analysis',
      {
        p_public_id: publicId,
        p_actor_user_id: admin.userId,
        p_request_id: requestId,
      },
    );
    const begin = parseBeginResult(beginData);

    if (beginError || !begin) {
      await recordTelemetry(context, {
        publicId,
        requestId,
        eventType: 'evidence_unavailable',
        automationOperationallyEnabled,
        actionPerformed: false,
      });
      console.error('admin-analyze-pothole evidence acquisition failed');
      return privateJson({ error: 'ai_unavailable' }, 503);
    }

    if (begin.outcome === 'NOT_FOUND') {
      return privateJson({ error: 'pothole_not_found' }, 404);
    }

    if (begin.outcome === 'NO_USABLE_PHOTOS') {
      await recordTelemetry(context, {
        publicId,
        requestId,
        eventType: 'no_usable_photos',
        selectedPhotoCount: 0,
        automationOperationallyEnabled,
        actionPerformed: false,
      });
      return privateJson({ error: 'no_usable_photos' }, 422);
    }

    if (begin.outcome === 'ACTOR_NOT_AUTHORIZED') {
      return privateJson({ error: 'forbidden' }, 403);
    }

    if (begin.outcome !== 'READY') {
      await recordTelemetry(context, {
        publicId,
        requestId,
        eventType: 'analysis_concurrent',
        automationOperationallyEnabled,
        actionPerformed: false,
      });
      return privateJson({ error: 'ai_unavailable' }, 409);
    }

    lease = { requestId, actorUserId: admin.userId };
    const photos = await withDeadline(
      downloadUsablePhotos(context, begin.photos),
      dependencies.evidenceLoadTimeoutMs ?? EVIDENCE_LOAD_TIMEOUT_MS,
    );

    if (photos === null) {
      await releaseLease(context, lease);
      lease = null;
      await recordTelemetry(context, {
        publicId,
        requestId,
        eventType: 'evidence_unavailable',
        selectedPhotoCount: begin.photos.length,
        automationOperationallyEnabled,
        actionPerformed: false,
      });
      return privateJson({ error: 'ai_unavailable' }, 503);
    }

    if (photos.length === 0) {
      await releaseLease(context, lease);
      lease = null;
      await recordTelemetry(context, {
        publicId,
        requestId,
        eventType: 'no_usable_photos',
        selectedPhotoCount: 0,
        automationOperationallyEnabled,
        actionPerformed: false,
      });
      return privateJson({ error: 'no_usable_photos' }, 422);
    }

    const apiKey = dependencies.getOpenAiApiKey();
    if (!apiKey) {
      await releaseLease(context, lease);
      lease = null;
      await recordTelemetry(context, providerTelemetry(
        publicId,
        requestId,
        'provider_unavailable',
        photos.length,
        automationOperationallyEnabled,
      ));
      return privateJson({ error: 'ai_unavailable' }, 503);
    }

    let providerResult: OpenAiPotholeAnalysisResult;
    await recordTelemetry(context, providerTelemetry(
      publicId,
      requestId,
      'provider_started',
      photos.length,
      automationOperationallyEnabled,
    ));
    const providerStartedAt = performance.now();
    try {
      providerResult = await (dependencies.analyzePhotos ?? analyzePotholePhotos)({
        apiKey,
        imageDataUrls: photos.map((photo) => photo.dataUrl),
        model: OPENAI_POTHOLE_MODEL,
      });
      providerSucceeded = true;
      await recordTelemetry(context, {
        ...providerTelemetry(
          publicId,
          requestId,
          'provider_succeeded',
          photos.length,
          automationOperationallyEnabled,
        ),
        durationMs: boundedDurationMs(providerStartedAt),
      });
    } catch (error) {
      await releaseLease(context, lease);
      lease = null;

      if (error instanceof OpenAiPotholeAnalysisError) {
        await recordTelemetry(context, {
          ...providerTelemetry(
            publicId,
            requestId,
            providerErrorEventType(error),
            photos.length,
            automationOperationallyEnabled,
          ),
          durationMs: boundedDurationMs(providerStartedAt),
        });
        return toProviderErrorResponse(error);
      }

      await recordTelemetry(context, {
        ...providerTelemetry(
          publicId,
          requestId,
          'provider_unavailable',
          photos.length,
          automationOperationallyEnabled,
        ),
        durationMs: boundedDurationMs(providerStartedAt),
      });
      console.error('admin-analyze-pothole provider request failed');
      return privateJson({ error: 'ai_unavailable' }, 503);
    }

    const completionArguments = {
      p_request_id: requestId,
      p_actor_user_id: admin.userId,
      p_provider: 'openai',
      p_model: OPENAI_POTHOLE_MODEL,
      p_prompt_version: OPENAI_POTHOLE_PROMPT_VERSION,
      p_schema_version: OPENAI_POTHOLE_SCHEMA_VERSION,
      p_classification: providerResult.assessment.classification,
      p_confidence: providerResult.assessment.confidence,
      p_photo_quality: providerResult.assessment.photoQuality,
      p_suggested_severity:
        providerResult.assessment.suggestedSeverity === 'unknown'
          ? null
          : providerResult.assessment.suggestedSeverity,
      p_visible_evidence: providerResult.assessment.visibleEvidence,
      p_cautions: providerResult.assessment.cautions,
      p_summary: providerResult.assessment.summary,
      p_input_photo_count: photos.length,
      p_input_evidence_sha256: await evidenceFingerprint(photos),
      p_provider_response_id: providerResult.providerResponseId,
    };

    // Retrying this database-only finalization once is safe: request_id is
    // unique and the RPC returns the existing immutable assessment if its
    // first response was lost. The paid provider request is never retried.
    let completion = await context.supabaseAdmin.rpc(
      'admin_complete_pothole_ai_analysis',
      completionArguments,
    );
    if (completion.error) {
      completion = await context.supabaseAdmin.rpc(
        'admin_complete_pothole_ai_analysis',
        completionArguments,
      );
    }

    const summary = parseCompletionResult(completion.data);
    if (completion.error || !summary?.assessment) {
      // The provider may have completed and the database response is
      // ambiguous. Keep the short lease until expiry instead of enabling an
      // immediate second paid request.
      await recordTelemetry(context, providerTelemetry(
        publicId,
        requestId,
        'persistence_failure',
        photos.length,
        automationOperationallyEnabled,
      ));
      console.error('admin-analyze-pothole assessment persistence failed');
      return privateJson({ error: 'ai_unavailable' }, 503);
    }

    lease = null;
    await recordTelemetry(context, providerTelemetry(
      publicId,
      requestId,
      'assessment_persisted',
      photos.length,
      automationOperationallyEnabled,
    ));
    return privateJson({
      ...summary,
      shadowAutomation: buildPotholeAutoVerifyShadowDecision(
        summary.assessment,
        automationEnabledValue,
      ),
    });
  } catch (error) {
    if (lease && !providerSucceeded) {
      await releaseLease(context, lease);
    }

    if (error instanceof AdminAuthorizationError) {
      return withPrivateNoStore(toAdminAuthorizationResponse(error));
    }

    if (error instanceof InvalidAdminDetailInputError) {
      return privateJson({ error: 'invalid_request' }, 400);
    }

    console.error('admin-analyze-pothole failed');
    return privateJson({ error: 'ai_unavailable' }, 503);
  }
}

async function recordTelemetry(
  context: AdminAnalyzeContext,
  event: AiOperationalEvent,
): Promise<void> {
  const recorded = await recordAiOperationalEvent(
    (functionName, arguments_) => context.supabaseAdmin.rpc(functionName, arguments_),
    event,
  );

  if (!recorded) {
    console.error('admin-analyze-pothole operational telemetry unavailable');
  }
}

function providerTelemetry(
  publicId: string,
  requestId: string,
  eventType: AiOperationalEventType,
  selectedPhotoCount: number,
  automationOperationallyEnabled: boolean,
): AiOperationalEvent {
  return {
    publicId,
    requestId,
    eventType,
    provider: 'openai',
    model: OPENAI_POTHOLE_MODEL,
    promptVersion: OPENAI_POTHOLE_PROMPT_VERSION,
    schemaVersion: OPENAI_POTHOLE_SCHEMA_VERSION,
    selectedPhotoCount,
    automationOperationallyEnabled,
    actionPerformed: false,
  };
}

function providerErrorEventType(error: OpenAiPotholeAnalysisError): AiOperationalEventType {
  if (error.code === 'timeout') {
    return 'provider_timeout';
  }
  if (error.code === 'rate_limited') {
    return 'provider_rate_limited';
  }
  if (error.code === 'invalid_response') {
    return 'provider_invalid_response';
  }
  return 'provider_unavailable';
}

function boundedDurationMs(startedAt: number): number {
  return Math.min(Math.max(Math.round(performance.now() - startedAt), 0), 300_000);
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidAdminDetailInputError('request body must be valid JSON');
  }
}

function parseBeginResult(value: unknown): BeginResult | null {
  if (!isRecord(value) || !isBeginOutcome(value.outcome) || !Array.isArray(value.photos)) {
    return null;
  }

  if (value.outcome !== 'READY') {
    return value.photos.length === 0 ? { outcome: value.outcome, photos: [] } : null;
  }

  if (value.photos.length < 1 || value.photos.length > 3) {
    return null;
  }

  const photos = value.photos.map(parseEvidencePhoto);
  if (photos.some((photo) => photo === null)) {
    return null;
  }

  const validPhotos = photos as EvidencePhoto[];
  if (
    new Set(validPhotos.map((photo) => photo.photoId)).size !== validPhotos.length ||
    new Set(validPhotos.map((photo) => photo.storagePath)).size !== validPhotos.length
  ) {
    return null;
  }

  return { outcome: 'READY', photos: validPhotos };
}

function parseEvidencePhoto(value: unknown): EvidencePhoto | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    !isUuid(value.photo_id) ||
    !isSafeStoragePath(value.storage_path) ||
    !isNullableJpegMimeType(value.mime_type) ||
    !isNullableFileSize(value.file_size_bytes) ||
    !isTimestamp(value.created_at)
  ) {
    return null;
  }

  return {
    photoId: value.photo_id,
    storagePath: value.storage_path,
    mimeType: value.mime_type,
    fileSizeBytes: value.file_size_bytes,
    createdAt: value.created_at,
  };
}

async function downloadUsablePhotos(
  context: AdminAnalyzeContext,
  photos: EvidencePhoto[],
): Promise<LoadedPhoto[]> {
  const loaded: LoadedPhoto[] = [];

  for (const photo of photos) {
    if (photo.fileSizeBytes !== null && photo.fileSizeBytes > MAX_JPEG_BYTES) {
      continue;
    }

    try {
      const { data, error } = await context.supabaseAdmin.storage
        .from(REPORT_PHOTO_BUCKET)
        .download(photo.storagePath);

      if (error || !data || data.size < 3 || data.size > MAX_JPEG_BYTES) {
        continue;
      }

      if (data.type && data.type !== 'image/jpeg') {
        continue;
      }

      const bytes = new Uint8Array(await data.arrayBuffer());
      if (!hasJpegSignature(bytes)) {
        continue;
      }

      const dataUrl = `data:image/jpeg;base64,${encodeBase64(bytes)}`;

      loaded.push({
        photoId: photo.photoId,
        byteLength: bytes.byteLength,
        contentSha256: await sha256Hex(dataUrl),
        dataUrl,
      });
    } catch {
      // A missing/corrupt private object is simply not usable AI evidence.
      // Do not log its path or the Storage error.
    }
  }

  return loaded;
}

async function withDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T | null> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return null;
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timeout = setTimeout(() => resolve(null), timeoutMs);
  });

  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

async function evidenceFingerprint(photos: LoadedPhoto[]): Promise<string> {
  const evidence = photos
    .map(
      (photo, index) =>
        `${index}:${photo.photoId}:${photo.byteLength}:${photo.contentSha256}`,
    )
    .join('\n');
  return sha256Hex(evidence);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function encodeBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  }
  return btoa(chunks.join(''));
}

function parseCompletionResult(value: unknown): AdminAiAssessmentSummaryDto | null {
  if (
    !isRecord(value) ||
    (value.outcome !== 'COMPLETED' && value.outcome !== 'ALREADY_COMPLETED')
  ) {
    return null;
  }

  return parseAdminAiAssessmentSummary({
    assessment: value.assessment,
    assessment_count: value.assessment_count,
  });
}

async function releaseLease(
  context: AdminAnalyzeContext,
  lease: { requestId: string; actorUserId: string },
): Promise<void> {
  try {
    const { error } = await context.supabaseAdmin.rpc('admin_release_pothole_ai_analysis', {
      p_request_id: lease.requestId,
      p_actor_user_id: lease.actorUserId,
    });

    if (error) {
      console.error('admin-analyze-pothole lease release failed');
    }
  } catch {
    console.error('admin-analyze-pothole lease release failed');
  }
}

function toProviderErrorResponse(error: OpenAiPotholeAnalysisError): Response {
  if (error.code === 'timeout') {
    return privateJson({ error: 'ai_timeout' }, 504);
  }

  if (error.code === 'rate_limited') {
    return privateJson({ error: 'ai_rate_limited' }, 429);
  }

  if (error.code === 'invalid_response') {
    return privateJson({ error: 'invalid_ai_response' }, 502);
  }

  return privateJson({ error: 'ai_unavailable' }, 503);
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function withPrivateNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  return new Response(response.body, { status: response.status, headers });
}

function isBeginOutcome(value: unknown): value is BeginResult['outcome'] {
  return (
    value === 'READY' ||
    value === 'NOT_FOUND' ||
    value === 'NO_USABLE_PHOTOS' ||
    value === 'ACTOR_NOT_AUTHORIZED' ||
    value === 'ANALYSIS_IN_PROGRESS' ||
    value === 'ALREADY_COMPLETED'
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isSafeStoragePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 1024 &&
    !value.startsWith('/') &&
    !value.split('/').includes('..')
  );
}

function isNullableJpegMimeType(value: unknown): value is string | null {
  return value === null || value === 'image/jpeg';
}

function isNullableFileSize(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= MAX_JPEG_BYTES)
  );
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
