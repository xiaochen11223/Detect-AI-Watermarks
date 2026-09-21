/**
 * Types for the watermark-detector landing section.
 *
 * The block is rendered via the dynamic-page pipeline (see
 * `src/themes/default/pages/dynamic-page.tsx`) — it is configured in
 * `src/config/locale/messages/en/pages/index.json` under a section with
 * `block: "watermark-detector"`.
 */

export interface WatermarkDetectorSection {
  id: string;
  block: 'watermark-detector';
  /** Optional heading shown above the tool. */
  title?: string;
  /** Optional sub-heading. */
  description?: string;
  /** Max input characters accepted by the textarea. Defaults to 20000. */
  max_chars?: number;
  /** Label of the analyze button. */
  analyze_label?: string;
  /** Label of the copy clean text button. */
  copy_label?: string;
  /** Label of the clear button. */
  clear_label?: string;
  /** Placeholder for the textarea. */
  placeholder?: string;
  /** Privacy notice shown under the tool. */
  privacy_notice?: string;
  /** Heading shown when suspicious characters are found. */
  found_heading?: string;
  /** Heading shown when no suspicious characters are found. */
  clean_heading?: string;
  /** Label shown for the AI review card when results come back. */
  ai_review_heading?: string;
}
