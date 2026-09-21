'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  analyze_label,
  ai_review_heading,
  clean_heading,
  clear_label,
  copy_label,
  found_heading,
  max_chars,
  placeholder,
  privacy_notice,
} from '@/themes/default/blocks/watermark-detector.defaults';
import { Section } from '@/shared/types/blocks/landing';
import { cn } from '@/shared/lib/utils';

interface ScanHit {
  codePoint: number;
  hexCode: string;
  name: string;
  type: string;
  typeName: string;
  position: number;
}

interface AiReview {
  score: number;
  reason: string;
  suspicious_patterns: string[];
}

interface DetectResponse {
  hits: ScanHit[];
  clean_text: string;
  hit_count: number;
  hit_by_type: Record<string, number>;
  hit_by_char: Record<string, number>;
  ai_review: AiReview | null;
  usage: {
    used: number;
    limit: number;
    remaining: number;
    is_login: boolean;
  };
}

interface LimitReachedResponse {
  error: 'limit_reached';
  message: string;
  usage: { used: number; limit: number; remaining: number; is_login: boolean };
  upgrade: { title: string; url: string };
}

export function WatermarkDetector({
  section,
  className,
}: {
  section: Section;
  className?: string;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DetectResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitModal, setLimitModal] = useState<LimitReachedResponse | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxChars = Number(section.max_chars ?? max_chars) || 20000;
  const placeholderText = section.placeholder ?? placeholder;
  const analyzeLabel = section.analyze_label ?? analyze_label;
  const copyLabel = section.copy_label ?? copy_label;
  const clearLabel = section.clear_label ?? clear_label;
  const privacyNotice = section.privacy_notice ?? privacy_notice;
  const foundHeading = section.found_heading ?? found_heading;
  const cleanHeading = section.clean_heading ?? clean_heading;
  const aiReviewHeading = section.ai_review_heading ?? ai_review_heading;

  const analyze = useCallback(async () => {
    if (!text.trim()) {
      toast.error('Please paste some text to analyze.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error === 'limit_reached') {
          setLimitModal(data as LimitReachedResponse);
        } else {
          setError(data?.message || 'Detection failed. Please try again.');
        }
        return;
      }
      setResult(data as DetectResponse);
    } catch (e) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [text]);

  const copyClean = useCallback(async () => {
    if (!result?.clean_text) return;
    try {
      await navigator.clipboard.writeText(result.clean_text);
      toast.success('Clean text copied to clipboard');
    } catch {
      toast.error('Failed to copy. Please copy manually.');
    }
  }, [result]);

  const clearAll = useCallback(() => {
    setText('');
    setResult(null);
    setError(null);
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
              rows={10}
              className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring min-h-[260px] flex-1 resize-y rounded-md border px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={analyze}
                disabled={loading || !text.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed"
              >
                {loading ? 'Analyzing…' : analyzeLabel}
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={loading}
                className="text-foreground border-input hover:bg-muted disabled:opacity-50 inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed"
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
            {error && (
              <div className="bg-destructive/10 text-destructive mb-3 rounded-md px-3 py-2 text-sm">
                {error}
              </div>
            )}

            {!result && !error && (
              <div className="text-muted-foreground flex flex-1 items-center justify-center py-16 text-sm">
                Results will appear here after you click Analyze.
              </div>
            )}

            {result && (
              <>
                {result.hit_count > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-foreground text-sm font-semibold">
                        {foundHeading}
                      </h3>
                      <span className="bg-destructive/10 text-destructive rounded-full px-3 py-0.5 text-xs font-semibold">
                        {result.hit_count} hidden
                      </span>
                    </div>

                    {result.ai_review && (
                      <div className="bg-primary/5 border-primary/20 rounded-md border p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <h4 className="text-foreground text-xs font-semibold">
                            {aiReviewHeading}
                          </h4>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-semibold',
                              result.ai_review.score >= 70
                                ? 'bg-destructive/10 text-destructive'
                                : result.ai_review.score >= 40
                                  ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                  : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            )}
                          >
                            Score {result.ai_review.score}/100
                          </span>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {result.ai_review.reason}
                        </p>
                        {result.ai_review.suspicious_patterns?.length > 0 && (
                          <ul className="text-muted-foreground mt-2 list-disc pl-4 text-xs">
                            {result.ai_review.suspicious_patterns.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

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

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-foreground text-sm font-semibold">
                          Cleaned text
                        </h3>
                        <button
                          type="button"
                          onClick={copyClean}
                          className="bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors"
                        >
                          {copyLabel}
                        </button>
                      </div>
                      <textarea
                        readOnly
                        value={result.clean_text}
                        rows={6}
                        className="border-input bg-background text-foreground min-h-[140px] w-full resize-y rounded-md border px-3 py-2 text-sm leading-relaxed"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center py-16">
                    <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 mb-3 flex size-12 items-center justify-center rounded-full text-xl">
                      ✓
                    </div>
                    <h3 className="text-foreground text-sm font-semibold">
                      {cleanHeading}
                    </h3>
                    <p className="text-muted-foreground mt-1 text-xs">
                      No hidden Unicode characters found.
                    </p>
                  </div>
                )}

                <p className="text-muted-foreground mt-3 text-xs">
                  {result.usage.remaining} of {result.usage.limit} checks left
                  today
                  {!result.usage.is_login && ' — sign up for 50/day.'}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Limit-reached modal */}
      {limitModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setLimitModal(null)}
        >
          <div
            className="bg-card w-full max-w-md rounded-2xl border p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-foreground mb-2 text-lg font-semibold">
              Daily limit reached
            </h3>
            <p className="text-muted-foreground mb-5 text-sm">
              {limitModal.message}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setLimitModal(null)}
                className="text-foreground border-input hover:bg-muted rounded-md border px-4 py-2 text-sm font-medium"
              >
                Maybe Later
              </button>
              <a
                href={limitModal.upgrade.url}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center rounded-md px-5 py-2 text-sm font-medium"
              >
                {limitModal.upgrade.title}
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
