/**
 * Hive AI-Generated Content Detection API wrapper.
 *
 * Acts as the optional server-side "second opinion" review called from
 * `/api/detect` ONLY when the front-end scanner finds hidden Unicode
 * characters (PRD 4.1 / Rules R-0301).
 *
 * Failures degrade gracefully: any HTTP error, network error, timeout, or
 * invalid JSON returns `null`, and the caller falls back to showing only the
 * front-end scan results (Rules R-0306).
 *
 * Env vars (see `.env.development`):
 *  - HIVE_API_KEY: API key. When empty, the wrapper returns `null` immediately.
 *  - HIVE_API_ENDPOINT: Hive sync task endpoint. Defaults to the official URL.
 *  - HIVE_TIMEOUT_MS: abort timeout. Defaults to 3000ms.
 */

export interface HiveSuspiciousPattern {
  pattern: string;
  count?: number;
  positions?: number[];
}

export interface HiveReviewResult {
  /** 0-100 — likelihood the text was AI-generated / carries an AI watermark. */
  score: number;
  /** One-sentence reason explaining the score. */
  reason: string;
  /** List of suspicious patterns (e.g. "large run of zero-width spaces"). */
  suspicious_patterns: string[];
}

export interface ScanHitSummary {
  hexCode: string;
  name: string;
  count: number;
}

interface HiveRequestBody {
  text: string;
  detected_hidden_chars: ScanHitSummary[];
}

interface HiveResponseData {
  code: string;
  data?: {
    output?: Array<{
      response?: {
        // Hive returns a JSON-encoded string payload for sync text tasks
        score?: number;
        reason?: string;
        suspicious_patterns?: string[];
      };
    }>;
  };
  error?: string;
}

const HIVE_DEFAULT_ENDPOINT = 'https://api.thehive.ai/api/v2/task/sync';
const HIVE_DEFAULT_TIMEOUT_MS = 3000;

/**
 * Call Hive AI-Generated Content Detection API to review the text.
 *
 * Returns `null` on any failure so the caller can degrade to front-end only.
 */
export async function reviewWithHive(
  text: string,
  hits: ScanHitSummary[]
): Promise<HiveReviewResult | null> {
  const apiKey = process.env.HIVE_API_KEY?.trim();
  if (!apiKey) {
    // No key configured — degrade silently (PRD allows MVP to ship without live key).
    return null;
  }

  const endpoint = process.env.HIVE_API_ENDPOINT?.trim() || HIVE_DEFAULT_ENDPOINT;
  const timeoutMs = Math.max(
    1000,
    Number(process.env.HIVE_TIMEOUT_MS ?? HIVE_DEFAULT_TIMEOUT_MS)
  );

  // Build the LLM-style prompt payload per PRD 5.3 so the model returns strict JSON.
  const prompt = `You are a text watermark analysis assistant.
Given the following text and a list of detected hidden Unicode characters,
return a JSON object:
{
  "score": 0-100,
  "reason": "short explanation",
  "suspicious_patterns": ["pattern1", "pattern2"]
}
Text: """${text.slice(0, 8000)}"""
Detected hidden chars: ${JSON.stringify(hits)}`;

  const body: HiveRequestBody = {
    text,
    detected_hidden_chars: hits,
  };

  // Hive sync task typically expects the prompt + metadata. We use the generic
  // shape so the wrapper keeps working even if Hive renames the model id later.
  const payload = {
    input: {
      prompt,
      text: body.text,
      detected_hidden_chars: body.detected_hidden_chars,
    },
    output: 'compact',
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return null;
    }

    const json: HiveResponseData = await res.json();

    if (json.error) {
      return null;
    }

    const inner = json.data?.output?.[0]?.response;

    // Hive may embed the LLM payload as a JSON string in `response`.
    const parsed = typeof inner === 'string' ? safeParseJSON(inner) : inner;

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const score = Number(parsed.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return null;
    }

    const reason = String(parsed.reason ?? '');
    const suspiciousPatterns = Array.isArray(parsed.suspicious_patterns)
      ? parsed.suspicious_patterns.map(String)
      : [];

    return {
      score: Math.round(score),
      reason,
      suspicious_patterns: suspiciousPatterns,
    };
  } catch {
    // Any network / timeout / parse failure → degrade (Rules R-0306).
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function safeParseJSON(value: string): any | null {
  try {
    return JSON.parse(value);
  } catch {
    // Try to extract the first {...} block — Hive sometimes wraps JSON in prose.
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
