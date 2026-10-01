'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  analyze_label,
  clean_heading,
  clear_label,
  copy_label,
  found_heading,
  max_chars,
  placeholder,
} from '@/themes/default/blocks/watermark-detector.defaults';
import { Section } from '@/shared/types/blocks/landing';
import { cn } from '@/shared/lib/utils';
import {
  ALL_CATEGORIES,
  getCategoryName,
  getHiddenCharDef,
  scanText,
  type HiddenCharType,
  type SpacingAnomaly,
} from '@/lib/watermark-scanner';

interface LocalResult {
  hits: {
    hexCode: string;
    name: string;
    type: HiddenCharType;
    typeName: string;
    position: number;
  }[];
  clean_text: string;
  hit_count: number;
  hit_by_char: Record<string, number>;
  hit_by_type: Partial<Record<HiddenCharType, number>>;
  spacing_anomalies: SpacingAnomaly[];
}

/** Group id -> friendly label shown above the checkbox. */
const CATEGORY_LABELS: Record<HiddenCharType, string> = {
  'zero-width': 'Zero-Width',
  'special-space': 'Special Spaces',
  'variation-selector': 'Variation Selectors',
  'directional-mark': 'Directional Marks',
  'invisible-joiner': 'Invisible Operators',
  separator: 'Line/Paragraph Separators',
  bom: 'Byte Order Mark',
};

export function WatermarkDetector({
  section,
  className,
}: {
  section: Section;
  className?: string;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<LocalResult | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<HiddenCharType>>(
    () => new Set<HiddenCharType>(ALL_CATEGORIES)
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxChars = Number(section.max_chars ?? max_chars) || 20000;
  const placeholderText = section.placeholder ?? placeholder;
  const analyzeLabel = section.analyze_label ?? analyze_label;
  const copyLabel = section.copy_label ?? copy_label;
  const exportLabel = section.export_label ?? 'Export';
  const clearLabel = section.clear_label ?? clear_label;
  const privacyNotice =
    section.privacy_notice ??
    '100% private — scanning runs entirely in your browser. Your text never leaves this page.';
  const foundHeading = section.found_heading ?? found_heading;
  const cleanHeading = section.clean_heading ?? clean_heading;

  const toggleCategory = (type: HiddenCharType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const analyze = useCallback(() => {
    if (!text.trim()) {
      toast.error('Please paste some text to analyze.');
      return;
    }
    // Pure client-side scan — no network request, no server, no AI cost.
    const scan = scanText(text, { enabledTypes: Array.from(enabledTypes) });
    setResult({
      hits: scan.hits.map((h) => ({
        hexCode: h.hexCode,
        name: h.name,
        type: h.type,
        typeName: h.typeName,
        position: h.position,
      })),
      clean_text: scan.cleanText,
      hit_count: scan.hitCount,
      hit_by_char: scan.hitByChar,
      hit_by_type: scan.hitByType,
      spacing_anomalies: scan.spacingAnomalies,
    });
  }, [text, enabledTypes]);

  /** Render the original text with every detected hidden character highlighted. */
  const highlightedPreview = useMemo(() => {
    if (!result) return null;
    const enabled = enabledTypes;
    const nodes: React.ReactNode[] = [];
    const codePoints = Array.from(text);
    codePoints.forEach((ch, i) => {
      const cp = ch.codePointAt(0)!;
      const def = getHiddenCharDef(cp);
      if (def && enabled.has(def.type)) {
        nodes.push(
          <mark
            key={i}
            title={`${def.hexCode} — ${def.name}`}
            className="rounded-sm bg-amber-300/60 px-0.5 text-amber-900 dark:bg-amber-500/40 dark:text-amber-100"
          >
            {ch}
          </mark>
        );
      } else {
        nodes.push(<span key={i}>{ch}</span>);
      }
    });
    return nodes;
  }, [result, text, enabledTypes]);

  const copyClean = useCallback(async () => {
    if (!result?.clean_text) return;
    try {
      await navigator.clipboard.writeText(result.clean_text);
      toast.success('Clean text copied to clipboard');
    } catch {
      toast.error('Failed to copy. Please copy manually.');
    }
  }, [result]);

  const downloadBlob = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportResults = useCallback(
    (format: 'txt' | 'md') => {
      if (!result) return;
      if (format === 'md') {
        const lines: string[] = [
          '# AI Watermark Detection Report',
          '',
          `**Hidden characters found:** ${result.hit_count}`,
          '',
          '## By category',
          '',
        ];
        for (const type of ALL_CATEGORIES) {
          const c = result.hit_by_type[type];
          if (c) lines.push(`- **${getCategoryName(type)}** — ${c}`);
        }
        lines.push('', '## By character', '');
        for (const [hex, count] of Object.entries(result.hit_by_char)) {
          const def = result.hits.find((h) => h.hexCode === hex);
          lines.push(`- \`${hex}\` ${def?.name ?? ''} — ×${count}`);
        }
        if (result.spacing_anomalies.length) {
          lines.push('', '## Spacing patterns', '');
          for (const s of result.spacing_anomalies) {
            lines.push(`- **${s.label}** — ×${s.count}`);
          }
        }
        lines.push('', '## Cleaned text', '', '```', result.clean_text, '```');
        downloadBlob(lines.join('\n'), 'watermark-report.md', 'text/markdown');
        return;
      }

      const lines: string[] = [
        'AI Watermark Detector — Results',
        '================================',
        `Hidden characters found: ${result.hit_count}`,
        '',
      ];
      if (result.hit_count > 0) {
        lines.push('Details:');
        for (const [hex, count] of Object.entries(result.hit_by_char)) {
          const def = result.hits.find((h) => h.hexCode === hex);
          lines.push(`  ${hex}  ${def?.name ?? ''}  x${count}`);
        }
        lines.push('', 'Cleaned text:', '--------------', result.clean_text);
      } else {
        lines.push('No hidden Unicode characters found.');
      }
      downloadBlob(lines.join('\n'), 'watermark-detection-results.txt', 'text/plain');
    },
    [result]
  );

  const clearAll = useCallback(() => {
    setText('');
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const onUploadTxt = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 200 * 1024) {
        toast.error('File too large. Please use a text file under 200KB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const content = String(reader.result ?? '').slice(0, maxChars);
        setText(content);
        toast.success(`Loaded ${file.name}`);
      };
      reader.onerror = () => toast.error('Failed to read file.');
      reader.readAsText(file);
    },
    [maxChars]
  );

  return (
    <section
      id={section.id}
      className={cn('py-12 md:py-16', section.className, className)}
    >
      <div className="container">
        {section.title && (
          <div className="mx-auto mb-8 max-w-2xl text-center text-balance">
            <h2 className="text-foreground text-2xl font-semibold tracking-tight md:text-3xl">
              {section.title}
            </h2>
            {section.description && (
              <p className="text-muted-foreground mt-3 text-sm md:text-base">
                {section.description}
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Input column */}
          <div className="bg-card flex flex-col rounded-2xl border p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <label
                htmlFor="wa-text-input"
                className="text-foreground text-sm font-medium"
              >
                Paste your text
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  onChange={onUploadTxt}
                  className="hidden"
                  id="wa-file-input"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-muted-foreground hover:text-foreground rounded-md border px-2 py-1 text-xs transition-colors"
                >
                  Upload .txt
                </button>
                <span className="text-muted-foreground text-xs">
                  {text.length}/{maxChars}
                </span>
              </div>
            </div>
            <textarea
              id="wa-text-input"
              value={text}
              onChange={(e) =>
                setText(e.target.value.slice(0, maxChars))
              }
              placeholder={placeholderText}
              rows={8}
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring min-h-[200px] flex-1 resize-y rounded-md border px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2"
            />

            {/* Detection category checkboxes */}
            <div className="mt-3">
              <div className="text-muted-foreground mb-1.5 text-xs font-medium">
                Detection options ({enabledTypes.size}/{ALL_CATEGORIES.length} selected)
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {ALL_CATEGORIES.map((type) => (
                  <label
                    key={type}
                    className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1.5 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={enabledTypes.has(type)}
                      onChange={() => toggleCategory(type)}
                      className="border-input size-3.5 accent-primary"
                    />
                    {CATEGORY_LABELS[type]}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={analyze}
                disabled={!text.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed"
              >
                {analyzeLabel}
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="text-foreground border-input hover:bg-muted inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium transition-colors"
              >
                {clearLabel}
              </button>
            </div>
            <p className="text-muted-foreground mt-3 text-xs">
              {privacyNotice}
            </p>
          </div>

          {/* Output column */}
          <div className="bg-card flex flex-col rounded-2xl border p-5 shadow-sm">
            {!result && (
              <div className="text-muted-foreground flex flex-1 items-center justify-center py-16 text-sm">
                Results will appear here after you click Analyze.
              </div>
            )}

            {result && (
              <div className="space-y-4">
                {/* Status banner */}
                {result.hit_count > 0 ? (
                  <div className="flex items-center justify-between">
                    <h3 className="text-foreground text-sm font-semibold">
                      {foundHeading}
                    </h3>
                    <span className="bg-destructive/10 text-destructive rounded-full px-3 py-0.5 text-xs font-semibold">
                      {result.hit_count} hidden
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 flex size-10 items-center justify-center rounded-full">
                      ✓
                    </div>
                    <div>
                      <h3 className="text-foreground text-sm font-semibold">
                        {cleanHeading}
                      </h3>
                      <p className="text-muted-foreground text-xs">
                        No hidden Unicode characters found.
                      </p>
                    </div>
                  </div>
                )}

                {/* Highlighted preview of original text */}
                {result.hit_count > 0 && (
                  <div>
                    <div className="text-muted-foreground mb-1 text-xs font-medium">
                      Original text — hidden characters highlighted in amber
                    </div>
                    <div className="border-input max-h-32 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 px-3 py-2 text-xs leading-relaxed">
                      {highlightedPreview}
                    </div>
                  </div>
                )}

                {/* Per-category grouped report */}
                {result.hit_count > 0 && (
                  <div>
                    <div className="text-muted-foreground mb-1 text-xs font-medium">
                      Found by category
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_CATEGORIES.map((type) => {
                        const count = result.hit_by_type[type];
                        if (!count) return null;
                        return (
                          <div
                            key={type}
                            className="bg-muted/50 flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs"
                          >
                            <span className="text-muted-foreground truncate">
                              {getCategoryName(type)}
                            </span>
                            <span className="text-foreground ml-2 font-semibold">
                              ×{count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Detailed per-character list */}
                {result.hit_count > 0 && (
                  <div className="border-border divide-y overflow-hidden rounded-md border">
                    {Object.entries(result.hit_by_char).map(
                      ([hexCode, count]) => {
                        const def = result.hits.find(
                          (h) => h.hexCode === hexCode
                        );
                        return (
                          <div
                            key={hexCode}
                            className="flex items-center justify-between px-3 py-2 text-xs"
                          >
                            <span className="text-foreground font-mono">
                              {hexCode}
                            </span>
                            <span className="text-muted-foreground ml-2 flex-1 truncate pl-3">
                              {def?.name ?? hexCode}
                            </span>
                            <span className="text-foreground ml-3 font-semibold">
                              ×{count}
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}

                {/* Spacing pattern warnings */}
                {result.spacing_anomalies.length > 0 && (
                  <div className="rounded-md border border-amber-300/50 bg-amber-500/10 p-3">
                    <div className="mb-1 text-xs font-semibold text-amber-800 dark:text-amber-200">
                      Spacing patterns to review
                    </div>
                    {result.spacing_anomalies.map((s) => (
                      <p
                        key={s.kind}
                        className="text-muted-foreground text-xs leading-relaxed"
                      >
                        <span className="text-amber-700 dark:text-amber-300 font-medium">
                          {s.label} ×{s.count}
                        </span>
                        — {s.description}
                      </p>
                    ))}
                  </div>
                )}

                {/* Cleaned text output (always shown after analysis) */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-foreground text-sm font-semibold">
                      Cleaned text
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={copyClean}
                        className="bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors"
                      >
                        {copyLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => exportResults('txt')}
                        className="text-muted-foreground hover:text-foreground rounded-md border px-3 py-1 text-xs transition-colors"
                      >
                        {exportLabel} .txt
                      </button>
                      <button
                        type="button"
                        onClick={() => exportResults('md')}
                        className="text-muted-foreground hover:text-foreground rounded-md border px-3 py-1 text-xs transition-colors"
                      >
                        {exportLabel} .md
                      </button>
                    </div>
                  </div>
                  <textarea
                    readOnly
                    value={result.clean_text}
                    rows={8}
                    className="border-input bg-background text-foreground min-h-[160px] w-full resize-y rounded-md border px-3 py-2 text-sm leading-relaxed"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
