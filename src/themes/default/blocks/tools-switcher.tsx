'use client';

import { useState } from 'react';

import { Section } from '@/shared/types/blocks/landing';
import { cn } from '@/shared/lib/utils';
import { WatermarkDetector } from './watermark-detector';
import { ImageMetadataRemover } from './image-metadata-remover';

type ToolTab = 'text' | 'image';

export function ToolsSwitcher({
  section,
  className,
}: {
  section: Section;
  className?: string;
}) {
  const [tab, setTab] = useState<ToolTab>('text');

  const cards: {
    key: ToolTab;
    title: string;
    desc: string;
    icon: string;
  }[] = [
    {
      key: 'text',
      title: 'Text Watermark Remover',
      desc: 'Detect and remove hidden Unicode watermark characters from AI-generated text.',
      icon: '📝',
    },
    {
      key: 'image',
      title: 'Image Metadata Remover',
      desc: 'Strip EXIF, XMP, GPS and IPTC metadata from JPEG, PNG and WebP images.',
      icon: '🖼️',
    },
  ];

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

        {/* Toggle cards — Text / Image */}
        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          {cards.map((c) => {
            const active = tab === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setTab(c.key)}
                className={cn(
                  'rounded-xl border p-4 text-left transition-all',
                  active
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'border-border bg-card hover:border-primary/40'
                )}
              >
                <div className="text-2xl">{c.icon}</div>
                <div className="text-foreground mt-1.5 text-sm font-semibold">
                  {c.title}
                </div>
                <div className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {c.desc}
                </div>
              </button>
            );
          })}
        </div>

        {/* Active tool */}
        <div className="mt-8">
          {tab === 'text' ? (
            <WatermarkDetector section={{ id: 'tool' }} />
          ) : (
            <ImageMetadataRemover section={{ id: 'image-metadata' }} />
          )}
        </div>
      </div>
    </section>
  );
}
