'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Section } from '@/shared/types/blocks/landing';
import { cn } from '@/shared/lib/utils';

interface MetadataFinding {
  key: string;
  label: string;
  found: boolean;
}

interface ImageResult {
  fileName: string;
  originalSize: number;
  cleanSize: number;
  findings: MetadataFinding[];
  cleanUrl: string;
  width: number;
  height: number;
}

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/** Scan an image's bytes for common metadata markers (no external library). */
function scanMetadata(buffer: ArrayBuffer, type: string): MetadataFinding[] {
  const bytes = new Uint8Array(buffer);
  const asString = (start: number, len: number) => {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[start + i]);
    return s;
  };
  const findings: MetadataFinding[] = [];

  if (type === 'image/jpeg') {
    // JPEG markers: walk segments.
    let hasExif = false;
    let hasXmp = false;
    let hasIptc = false;
    let hasGps = false;
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      let i = 2;
      while (i < bytes.length - 4) {
        if (bytes[i] !== 0xff) break;
        const marker = bytes[i + 1];
        // APP1 = 0xE1 Exif; APP1 also carries XMP sometimes; APP13 = 0xED IPTC.
        if (marker === 0xe1) {
          const seg = asString(i + 4, Math.min(40, bytes.length - i - 4));
          if (seg.startsWith('Exif')) hasExif = true;
          else if (seg.includes('ns.adobe.com/xap')) hasXmp = true;
        }
        if (marker === 0xed) hasIptc = true;
        if (marker === 0xe2) {
          const seg = asString(i + 4, Math.min(40, bytes.length - i - 4));
          if (seg.includes('ns.adobe.com/xap')) hasXmp = true;
        }
        const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
        if (segLen < 2) break;
        i += 2 + segLen;
      }
    }
    findings.push(
      { key: 'exif', label: 'EXIF camera metadata', found: hasExif },
      { key: 'gps', label: 'GPS location', found: hasGps || hasExif },
      { key: 'xmp', label: 'XMP / Adobe metadata', found: hasXmp },
      { key: 'iptc', label: 'IPTC copyright / contact', found: hasIptc }
    );
  } else if (type === 'image/png') {
    // PNG chunks: look for tEXt/iTXt/eXIf.
    const head = asString(0, Math.min(bytes.length, 20000));
    findings.push(
      { key: 'exif', label: 'eXIf camera metadata', found: head.includes('eXIf') },
      { key: 'xmp', label: 'XMP text chunks', found: head.includes('iTXt') || head.includes('XML:com.adobe.xmp') },
      { key: 'iptc', label: 'Text/author chunks', found: head.includes('tEXt') }
    );
  } else {
    findings.push(
      { key: 'exif', label: 'Embedded metadata', found: false },
      { key: 'xmp', label: 'XMP / provenance', found: false }
    );
  }

  return findings;
}

export function ImageMetadataRemover({
  section,
  className,
}: {
  section: Section;
  className?: string;
}) {
  const [result, setResult] = useState<ImageResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(file.type)) {
      toast.error('Please upload a JPG, PNG, or WebP image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      const findings = scanMetadata(buffer, file.type);

      const img = new Image();
      const url = URL.createObjectURL(new Blob([buffer]));
      img.onload = () => {
        // Redraw through canvas — this strips EXIF/XMP/IPTC entirely.
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          toast.error('Could not process this image.');
          return;
        }
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              toast.error('Could not export the cleaned image.');
              return;
            }
            const cleanUrl = URL.createObjectURL(blob);
            setResult({
              fileName: file.name,
              originalSize: file.size,
              cleanSize: blob.size,
              findings,
              cleanUrl,
              width: img.naturalWidth,
              height: img.naturalHeight,
            });
            const anyFound = findings.some((f) => f.found);
            toast.success(
              anyFound
                ? 'Metadata stripped — ready to download'
                : 'Image processed (no embedded metadata found)'
            );
          },
          file.type === 'image/png' ? 'image/png' : 'image/jpeg',
          0.92
        );
      };
      img.onerror = () => toast.error('Could not read this image.');
      img.src = url;
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <section
      id={section.id}
      className={cn('py-12 md:py-16', section.className, className)}
    >
      <div className="container">
        <div className="mx-auto mb-8 max-w-2xl text-center text-balance">
          <div className="mb-2 inline-flex items-center gap-2">
            <h2 className="text-foreground text-2xl font-semibold tracking-tight md:text-3xl">
              {section.title ?? 'Image Metadata Remover'}
            </h2>
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-bold text-violet-600 dark:text-violet-300">
              PRO
            </span>
          </div>
          {section.description && (
            <p className="text-muted-foreground mt-3 text-sm md:text-base">
              {section.description}
            </p>
          )}
        </div>

        <div className="mx-auto max-w-2xl">
          <div className="bg-card rounded-2xl border p-5 shadow-sm">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onPick}
              className="hidden"
            />
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                dragging
                  ? 'border-primary bg-primary/5'
                  : 'border-input hover:border-primary/50'
              )}
            >
              <div className="text-foreground text-sm font-medium">
                Drop an image here, or click to browse
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                JPG, PNG or WebP · processed locally in your browser · no upload
              </p>
            </div>

            {result && (
              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {result.fileName} · {result.width}×{result.height}
                  </span>
                  <span className="text-muted-foreground">
                    {fmtSize(result.originalSize)} →{' '}
                    <span className="text-foreground font-semibold">
                      {fmtSize(result.cleanSize)}
                    </span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {result.findings.map((f) => (
                    <div
                      key={f.key}
                      className={cn(
                        'rounded-md px-2.5 py-2 text-center text-xs',
                        f.found
                          ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200'
                          : 'bg-muted/50 text-muted-foreground'
                      )}
                    >
                      <div className="font-semibold">
                        {f.found ? 'Stripped' : 'Not found'}
                      </div>
                      <div className="mt-0.5 leading-tight">{f.label}</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="text-xs">
                    <div className="text-foreground font-semibold">
                      Clean copy ready
                    </div>
                    <div className="text-muted-foreground">
                      No EXIF, GPS, XMP or IPTC data attached.
                    </div>
                  </div>
                  <a
                    href={result.cleanUrl}
                    download={`cleaned-${result.fileName}`}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors"
                  >
                    Download cleaned image
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
