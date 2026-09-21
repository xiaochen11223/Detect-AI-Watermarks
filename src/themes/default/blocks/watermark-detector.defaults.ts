/**
 * Default copy for the watermark-detector block.
 *
 * Each value can be overridden per-locale via the matching field in
 * `src/config/locale/messages/en/pages/index.json` (section `tool.*`).
 */

export const analyze_label = 'Analyze';
export const copy_label = 'Copy Clean Text';
export const clear_label = 'Clear';
export const max_chars = 20000;
export const placeholder =
  'Paste text from ChatGPT, Claude, Gemini or any other source. We will scan it for invisible Unicode characters and AI watermarks…';
export const privacy_notice =
  'Your text is only sent for AI review if suspicious patterns are found. We never store your input.';
export const found_heading = 'Hidden characters detected';
export const clean_heading = 'No AI watermarks detected';
export const ai_review_heading = 'AI-generated content review';
