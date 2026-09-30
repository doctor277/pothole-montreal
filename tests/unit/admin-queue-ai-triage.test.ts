import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { handleAdminListPotholes } from '../../supabase/functions/_shared/admin-list-potholes';
import { loadQueueAiTriage } from '../../supabase/functions/_shared/admin-queue-ai-triage';

const row = {
  public_id: 'MTL-000003', status: 'VERIFIED', formatted_address: 'Stored address', latitude: 45.51,
  longitude: -73.57, report_count: 2, latest_severity: 'MEDIUM', created_at: '2026-09-01T00:00:00Z',
  latest_report_created_at: '2026-09-01T01:00:00Z', result_limit_reached: false,
  storage_path: 'must-not-leak', reporter_user_id: 'must-not-leak',
};
const assessment = {
  classification: 'unlikely_pothole', confidence: 0.99, photo_quality: 'good', suggested_severity: 'MEDIUM',
  input_photo_count: 1, model: 'gpt-5.6-terra', prompt_version: 'pothole-vision-v1', schema_version: 'pothole-assessment-v1',
  requested_at: '2026-09-01T02:00:00Z', created_at: '2026-09-01T02:01:00Z',
  requested_by_user_id: 'must-not-leak', input_evidence_sha256: 'must-not-leak', raw_response: 'must-not-leak',
};
const summary = (value: unknown = assessment, stale = false) => ({
  outcome: 'OK', items: [{ public_id: row.public_id, assessment: value,
    latest_evidence_created_at: '2026-09-01T01:00:00Z', evidence_changed_since_assessment: stale }],
});
function fake(options: { anonymous?: boolean; active?: boolean; noUser?: boolean; rows?: unknown; ai?: unknown; aiError?: boolean; coreError?: boolean } = {}) {
  const getUser = vi.fn().mockResolvedValue({ data: { user: options.noUser ? null : {
    id: '00000000-0000-4000-8000-000000000041', email: 'queue-admin@example.test', is_anonymous: options.anonymous ?? false,
  } }, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: { is_active: options.active ?? true }, error: null });
  const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }) });
  const download = vi.fn(() => { throw new Error('queue must not download'); });
  const rpc = vi.fn(async (name: string) => {
    if (name === 'admin_list_potholes') return { data: options.rows ?? [row], error: options.coreError ? {} : null };
    if (name === 'admin_get_queue_ai_triage_inputs') return { data: options.ai ?? summary(), error: options.aiError ? {} : null };
    throw new Error('unexpected mutation/provider/lease/telemetry RPC');
  });
  return { context: { supabase: { auth: { getUser } }, supabaseAdmin: { from, rpc, storage: { from: download } } } as never, rpc, from, download };
}
const request = (body: unknown = {}) => new Request('http://local.test', { method: 'POST', body: JSON.stringify(body) });

describe('production admin queue shadow triage path', () => {
  it.each([
    [{ noUser: true }, 401], [{ anonymous: true }, 403], [{ active: false }, 403],
  ] as const)('denies unauthorized callers before all queue reads: %o', async (options, status) => {
    const f = fake(options);
    expect((await handleAdminListPotholes(request(), f.context)).status).toBe(status);
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.download).not.toHaveBeenCalled();
  });
  it('returns sanitized hints but preserves VERIFIED despite AI disagreement', async () => {
    const f = fake();
    const response = await handleAdminListPotholes(request({ statuses: null }), f.context);
    expect(response.status).toBe(200);
    const dto = await response.json();
    expect(dto.potholes[0]).toMatchObject({ status: 'VERIFIED', reportCount: 2,
      aiTriageAvailability: 'available', aiTriage: { category: 'likely_not_pothole', shadowOnly: true } });
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(['admin_list_potholes', 'admin_get_queue_ai_triage_inputs']);
    expect(f.rpc).toHaveBeenLastCalledWith('admin_get_queue_ai_triage_inputs', {
      p_public_ids: ['MTL-000003'], p_actor_user_id: '00000000-0000-4000-8000-000000000041',
    });
    expect(f.download).not.toHaveBeenCalled();
    expect(JSON.stringify(dto)).not.toContain('must-not-leak');
    for (const field of ['storage_path', 'reporter_user_id', 'requested_by_user_id', 'request_id', 'input_evidence_sha256', 'provider_response_id', 'raw_response']) {
      expect(JSON.stringify(dto)).not.toContain(field);
    }
  });
  it('keeps existing default status filters and tuple pagination unchanged', async () => {
    const f = fake({ rows: [{ ...row, result_limit_reached: true }] });
    const response = await handleAdminListPotholes(request(), f.context);
    expect(f.rpc).toHaveBeenCalledWith('admin_list_potholes', {
      p_statuses: ['REPORTED', 'UNDER_REVIEW'], p_limit: 25, p_cursor_created_at: null, p_cursor_public_id: null,
    });
    expect((await response.json()).nextCursor).toEqual({ createdAt: row.created_at, publicId: row.public_id });
  });
  it('uses one companion batch for multiple queue rows rather than N+1 calls', async () => {
    const second = { ...row, public_id: 'MTL-000004', status: 'REJECTED' };
    const f = fake({ rows: [row, second], ai: { outcome: 'OK', items: [
      ...summary({ ...assessment, classification: 'likely_pothole' }).items,
      { ...summary().items[0], public_id: second.public_id },
    ] } });
    expect((await handleAdminListPotholes(request({ statuses: null }), f.context)).status).toBe(200);
    expect(f.rpc).toHaveBeenCalledTimes(2);
    expect(f.download).not.toHaveBeenCalled();
  });
  it.each([summary(null), summary(assessment, true)])('supports missing and stale assessments: %o', async (ai) => {
    const f = fake({ ai });
    const dto = await (await handleAdminListPotholes(request(), f.context)).json();
    expect(dto.potholes[0].aiTriage.category).toBe(ai.items[0].assessment === null ? 'no_assessment' : 'stale_assessment');
  });
  it.each([{}, { ...summary(), items: [] }, summary({ ...assessment, confidence: null })])('isolates malformed AI metadata: %o', async (ai) => {
    const f = fake({ ai });
    const response = await handleAdminListPotholes(request(), f.context);
    expect(response.status).toBe(200);
    expect((await response.json()).potholes[0]).toMatchObject({ status: 'VERIFIED', aiTriageAvailability: 'unavailable', aiTriage: null });
  });
  it('isolates an AI RPC error but not a genuine core queue failure', async () => {
    const f = fake({ aiError: true });
    expect((await handleAdminListPotholes(request(), f.context)).status).toBe(200);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const core = fake({ coreError: true });
    expect((await handleAdminListPotholes(request(), core.context)).status).toBe(500);
    expect(core.rpc).toHaveBeenCalledTimes(1);
  });
  it('makes no companion query for an empty queue and rejects caller-supplied identity', async () => {
    const f = fake({ rows: [] });
    expect((await handleAdminListPotholes(request(), f.context)).status).toBe(200);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    f.rpc.mockClear();
    expect((await handleAdminListPotholes(request({ actorUserId: 'forbidden' }), f.context)).status).toBe(400);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it('bounds a stalled supplemental read and catches thrown transport errors', async () => {
    const stalled = vi.fn(() => new Promise<{ data: unknown; error: unknown }>(() => undefined));
    expect(await loadQueueAiTriage(stalled, ['MTL-000003'], 'admin', 5)).toBeNull();
    expect(await loadQueueAiTriage(vi.fn().mockRejectedValue(new Error('unsafe')), ['MTL-000003'], 'admin')).toBeNull();
  });
  it('has no paid-provider, Storage, lease, persistence, or telemetry dependency in the queue boundary', () => {
    for (const name of ['admin-list-potholes.ts', 'admin-queue-ai-triage.ts', 'pothole-ai-triage-policy.ts']) {
      const source = readFileSync(new URL(`../../supabase/functions/_shared/${name}`, import.meta.url), 'utf8');
      for (const forbidden of ['OPENAI_API_KEY', 'admin-analyze-pothole', 'openai-pothole-analysis', '.storage', 'admin_begin_pothole_ai_analysis', 'admin_complete_pothole_ai_analysis', 'record_pothole_ai_operational_event', 'admin_transition_pothole_status']) {
        expect(source).not.toContain(forbidden);
      }
    }
  });
});
