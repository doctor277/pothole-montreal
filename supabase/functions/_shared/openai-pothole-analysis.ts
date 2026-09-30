import {
  MAX_AI_LIST_ITEM_LENGTH,
  MAX_AI_LIST_ITEMS,
  MAX_AI_SUMMARY_LENGTH,
  parsePotholeAiAssessment,
  potholeAiClassifications,
  potholeAiPhotoQualities,
  potholeAiSuggestedSeverities,
  type PotholeAiAssessment,
} from './pothole-ai-assessment.ts';

export const OPENAI_POTHOLE_MODEL = 'gpt-5.6-terra';
export const OPENAI_POTHOLE_PROMPT_VERSION = 'pothole-vision-v1';
export const OPENAI_POTHOLE_SCHEMA_VERSION = 'pothole-assessment-v1';
export const OPENAI_POTHOLE_TIMEOUT_MS = 45_000;

export const OPENAI_POTHOLE_INSTRUCTIONS = `You are providing a shadow-mode visual assessment of possible road damage for a human moderator.

Assess only visible evidence in the supplied photos. Distinguish a pothole from cracks, repaired asphalt, road patches, utility covers or manholes, shadows, standing water, debris, stains, and general pavement wear.

Do not infer exact depth without a reliable visual scale. Do not claim engineering or municipal certainty. Use uncertain when the evidence is insufficient. Confidence means confidence in the visible pothole classification only. Suggested severity is a visual suggestion, not an engineering determination. Human moderation remains authoritative.`;

export const OPENAI_POTHOLE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    classification: { type: 'string', enum: potholeAiClassifications },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    photoQuality: { type: 'string', enum: potholeAiPhotoQualities },
    suggestedSeverity: { type: 'string', enum: potholeAiSuggestedSeverities },
    visibleEvidence: {
      type: 'array',
      maxItems: MAX_AI_LIST_ITEMS,
      items: { type: 'string', minLength: 1, maxLength: MAX_AI_LIST_ITEM_LENGTH },
    },
    cautions: {
      type: 'array',
      maxItems: MAX_AI_LIST_ITEMS,
      items: { type: 'string', minLength: 1, maxLength: MAX_AI_LIST_ITEM_LENGTH },
    },
    summary: { type: 'string', minLength: 1, maxLength: MAX_AI_SUMMARY_LENGTH },
  },
  required: [
    'classification',
    'confidence',
    'photoQuality',
    'suggestedSeverity',
    'visibleEvidence',
    'cautions',
    'summary',
  ],
} as const;

export type OpenAiPotholeAnalysisErrorCode =
  | 'timeout'
  | 'rate_limited'
  | 'unavailable'
  | 'invalid_response';

export class OpenAiPotholeAnalysisError extends Error {
  constructor(readonly code: OpenAiPotholeAnalysisErrorCode) {
    super(code);
    this.name = 'OpenAiPotholeAnalysisError';
  }
}

export type OpenAiPotholeAnalysisResult = {
  assessment: PotholeAiAssessment;
  providerResponseId: string | null;
};

export async function analyzePotholePhotos(input: {
  apiKey: string;
  imageDataUrls: string[];
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<OpenAiPotholeAnalysisResult> {
  const model = input.model ?? OPENAI_POTHOLE_MODEL;
  const timeoutMs = input.timeoutMs ?? OPENAI_POTHOLE_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? fetch;

  if (
    input.apiKey.length === 0 ||
    !isBoundedProviderMetadata(model) ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    input.imageDataUrls.length < 1 ||
    input.imageDataUrls.length > 3 ||
    !input.imageDataUrls.every(isJpegDataUrl)
  ) {
    throw new OpenAiPotholeAnalysisError('unavailable');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetchImpl('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          store: false,
          reasoning: { effort: 'low' },
          max_output_tokens: 1_200,
          instructions: OPENAI_POTHOLE_INSTRUCTIONS,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: 'Assess only the visible road damage in these report photos.',
                },
                ...input.imageDataUrls.map((imageUrl) => ({
                  type: 'input_image' as const,
                  image_url: imageUrl,
                  detail: 'high' as const,
                })),
              ],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'pothole_visual_assessment',
              strict: true,
              schema: OPENAI_POTHOLE_OUTPUT_SCHEMA,
            },
          },
        }),
      });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw new OpenAiPotholeAnalysisError('timeout');
      }

      throw new OpenAiPotholeAnalysisError('unavailable');
    }

    if (response.status === 429) {
      throw new OpenAiPotholeAnalysisError('rate_limited');
    }

    if (!response.ok) {
      throw new OpenAiPotholeAnalysisError('unavailable');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) {
        throw new OpenAiPotholeAnalysisError('timeout');
      }

      throw new OpenAiPotholeAnalysisError('invalid_response');
    }

    const outputText = extractCompletedOutputText(payload);
    if (!outputText) {
      throw new OpenAiPotholeAnalysisError('invalid_response');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      throw new OpenAiPotholeAnalysisError('invalid_response');
    }

    const assessment = parsePotholeAiAssessment(parsed);
    if (!assessment) {
      throw new OpenAiPotholeAnalysisError('invalid_response');
    }

    return {
      assessment,
      providerResponseId: toSafeProviderResponseId(payload),
    };
  } finally {
    // Keep the deadline active through response-body consumption and
    // validation; fetch can resolve as soon as response headers arrive.
    clearTimeout(timeout);
  }
}

function extractCompletedOutputText(value: unknown): string | null {
  if (!isRecord(value) || value.status !== 'completed' || !Array.isArray(value.output)) {
    return null;
  }

  const texts: string[] = [];
  for (const item of value.output) {
    if (!isRecord(item) || item.type !== 'message' || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (
        isRecord(content) &&
        content.type === 'output_text' &&
        typeof content.text === 'string'
      ) {
        texts.push(content.text);
      }
    }
  }

  return texts.length === 1 && texts[0].length > 0 ? texts[0] : null;
}

function toSafeProviderResponseId(value: unknown): string | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null;
  }

  return /^resp_[A-Za-z0-9_-]{1,120}$/.test(value.id) ? value.id : null;
}

function isBoundedProviderMetadata(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function isJpegDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value);
}

function isAbortError(value: unknown): boolean {
  return isRecord(value) && value.name === 'AbortError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
