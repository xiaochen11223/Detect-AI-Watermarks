/**
 * AI Watermark Scanner — core Unicode hidden/control character detection logic.
 *
 * Covers 26+ classes of invisible Unicode characters commonly used as AI-generated
 * text watermarks or that leak from AI tools (ChatGPT, Claude, Gemini, etc.).
 *
 * Used both on the front-end (browser-first instant scan) and re-exported for the
 * server-side `/api/detect` route so the rule set stays in sync.
 *
 * Reference: PRD 4.1 + Rules 3.1 (R-0201, R-0202, R-0203, R-0205).
 */

/** Hidden character category id. */
export type HiddenCharType =
  | 'zero-width'
  | 'variation-selector'
  | 'directional-mark'
  | 'special-space'
  | 'invisible-joiner'
  | 'separator'
  | 'bom';

export interface HiddenCharDef {
  /** Unicode code point (decimal, e.g. 0x200b). */
  codePoint: number;
  /** Display label like `U+200B`. */
  hexCode: string;
  /** Human-readable name. */
  name: string;
  /** Category id used to group hits in the UI. */
  type: HiddenCharType;
  /** Category display name. */
  typeName: string;
  /** Short description shown in the "What We Detect" grid. */
  description: string;
}

export interface ScanHit {
  codePoint: number;
  hexCode: string;
  name: string;
  type: HiddenCharType;
  typeName: string;
  /** Index in the Array.from(text) iteration (per code point, not UTF-16). */
  position: number;
}

export interface ScanResult {
  /** All detected hidden characters, in document order. */
  hits: ScanHit[];
  /** Original text with all hits removed. */
  cleanText: string;
  /** Total number of detected characters. */
  hitCount: number;
  /** Aggregated count per category id. */
  hitByType: Partial<Record<HiddenCharType, number>>;
  /** Aggregated count per code point (hexCode -> count). */
  hitByChar: Record<string, number>;
}

const CATEGORY_NAMES: Record<HiddenCharType, string> = {
  'zero-width': 'Zero-Width Characters',
  'variation-selector': 'Variation Selectors',
  'directional-mark': 'Bidirectional Control Marks',
  'special-space': 'Special & Invisible Spaces',
  'invisible-joiner': 'Invisible Joiners & Operators',
  separator: 'Line & Paragraph Separators',
  bom: 'Byte Order Mark',
};

const makeHex = (cp: number): string =>
  `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

/**
 * Canonical list of hidden/control Unicode characters this tool detects.
 * 30+ entries covering the 26 classes required by PRD 4.1 / Rules R-0202.
 */
export const HIDDEN_CHARS: HiddenCharDef[] = [
  // --- Zero-Width Characters ---
  {
    codePoint: 0x200b,
    hexCode: makeHex(0x200b),
    name: 'Zero-Width Space',
    type: 'zero-width',
    typeName: CATEGORY_NAMES['zero-width'],
    description:
      'Invisible space used to break words without rendering a visible gap. Common ChatGPT watermark.',
  },
  {
    codePoint: 0x200c,
    hexCode: makeHex(0x200c),
    name: 'Zero-Width Non-Joiner',
    type: 'zero-width',
    typeName: CATEGORY_NAMES['zero-width'],
    description: 'Invisible character that prevents ligature joining between adjacent glyphs.',
  },
  {
    codePoint: 0x200d,
    hexCode: makeHex(0x200d),
    name: 'Zero-Width Joiner',
    type: 'zero-width',
    typeName: CATEGORY_NAMES['zero-width'],
    description: 'Invisible character that requests joining of adjacent glyphs (e.g. emoji sequences).',
  },
  {
    codePoint: 0x2060,
    hexCode: makeHex(0x2060),
    name: 'Word Joiner',
    type: 'zero-width',
    typeName: CATEGORY_NAMES['zero-width'],
    description: 'Zero-width no-break space; prevents line break without showing any visible width.',
  },
  // --- Variation Selectors 1-16 (U+FE00 – U+FE0F) ---
  ...Array.from({ length: 16 }, (_, i): HiddenCharDef => {
    const cp = 0xfe00 + i;
    const vsName =
      i === 14
        ? 'Variation Selector 15 (Text Presentation)'
        : i === 15
          ? 'Variation Selector 16 (Emoji Presentation)'
          : `Variation Selector ${i + 1}`;
    return {
      codePoint: cp,
      hexCode: makeHex(cp),
      name: vsName,
      type: 'variation-selector',
      typeName: CATEGORY_NAMES['variation-selector'],
      description:
        'Invisible formatting character that selects a specific glyph variant of the preceding character.',
    };
  }),
  // --- Bidirectional / Directional Marks ---
  {
    codePoint: 0x200e,
    hexCode: makeHex(0x200e),
    name: 'Left-to-Right Mark',
    type: 'directional-mark',
    typeName: CATEGORY_NAMES['directional-mark'],
    description: 'Invisible mark that sets directionality to LTR between same-direction characters.',
  },
  {
    codePoint: 0x200f,
    hexCode: makeHex(0x200f),
    name: 'Right-to-Left Mark',
    type: 'directional-mark',
    typeName: CATEGORY_NAMES['directional-mark'],
    description: 'Invisible mark that sets directionality to RTL between same-direction characters.',
  },
  {
    codePoint: 0x202a,
    hexCode: makeHex(0x202a),
    name: 'Left-to-Right Embedding',
    type: 'directional-mark',
    typeName: CATEGORY_NAMES['directional-mark'],
    description: 'Treat following text as LTR embedded. Often abused for spoofing.',
  },
  {
    codePoint: 0x202b,
    hexCode: makeHex(0x202b),
    name: 'Right-to-Left Embedding',
    type: 'directional-mark',
    typeName: CATEGORY_NAMES['directional-mark'],
    description: 'Treat following text as RTL embedded. Often abused for spoofing.',
  },
  {
    codePoint: 0x202c,
    hexCode: makeHex(0x202c),
    name: 'Pop Directional Formatting',
    type: 'directional-mark',
    typeName: CATEGORY_NAMES['directional-mark'],
    description: 'Ends the scope of the last LRE/RLE embedding.',
  },
  {
    codePoint: 0x202d,
    hexCode: makeHex(0x202d),
    name: 'Left-to-Right Override',
    type: 'directional-mark',
    typeName: CATEGORY_NAMES['directional-mark'],
    description: 'Force LTR character ordering. Heavily abused in phishing/spoofing.',
  },
  {
    codePoint: 0x202e,
    hexCode: makeHex(0x202e),
    name: 'Right-to-Left Override',
    type: 'directional-mark',
    typeName: CATEGORY_NAMES['directional-mark'],
    description: 'Force RTL character ordering. Heavily abused in phishing/spoofing.',
  },
  {
    codePoint: 0x2066,
    hexCode: makeHex(0x2066),
    name: 'Left-to-Right Isolate',
    type: 'directional-mark',
    typeName: CATEGORY_NAMES['directional-mark'],
    description: 'Isolates following text as LTR without affecting surrounding direction.',
  },
  {
    codePoint: 0x2067,
    hexCode: makeHex(0x2067),
    name: 'Right-to-Left Isolate',
    type: 'directional-mark',
    typeName: CATEGORY_NAMES['directional-mark'],
    description: 'Isolates following text as RTL without affecting surrounding direction.',
  },
  {
    codePoint: 0x2068,
    hexCode: makeHex(0x2068),
    name: 'First Strong Isolate',
    type: 'directional-mark',
    typeName: CATEGORY_NAMES['directional-mark'],
    description: 'Isolates following text and infers direction from the first strong character.',
  },
  {
    codePoint: 0x2069,
    hexCode: makeHex(0x2069),
    name: 'Pop Directional Isolate',
    type: 'directional-mark',
    typeName: CATEGORY_NAMES['directional-mark'],
    description: 'Terminates the most recent LRI/RLI/FSI isolate scope.',
  },
  // --- Special & Invisible Spaces ---
  {
    codePoint: 0x00a0,
    hexCode: makeHex(0x00a0),
    name: 'No-Break Space',
    type: 'special-space',
    typeName: CATEGORY_NAMES['special-space'],
    description: 'Looks like a regular space but prevents line wrapping. Breaks CMS parsers.',
  },
  {
    codePoint: 0x202f,
    hexCode: makeHex(0x202f),
    name: 'Narrow No-Break Space',
    type: 'special-space',
    typeName: CATEGORY_NAMES['special-space'],
    description: 'Half-width no-break space. Often leaks from AI tools and French typography.',
  },
  {
    codePoint: 0x205f,
    hexCode: makeHex(0x205f),
    name: 'Medium Mathematical Space',
    type: 'special-space',
    typeName: CATEGORY_NAMES['special-space'],
    description: 'Invisible math spacing used in formulas; rarely needed in prose.',
  },
  {
    codePoint: 0x2007,
    hexCode: makeHex(0x2007),
    name: 'Figure Space',
    type: 'special-space',
    typeName: CATEGORY_NAMES['special-space'],
    description: 'Space equal to a digit width. Breaks HTML whitespace normalization.',
  },
  {
    codePoint: 0x2008,
    hexCode: makeHex(0x2008),
    name: 'Punctuation Space',
    type: 'special-space',
    typeName: CATEGORY_NAMES['special-space'],
    description: 'Space equal to width of a period or comma.',
  },
  {
    codePoint: 0x2009,
    hexCode: makeHex(0x2009),
    name: 'Thin Space',
    type: 'special-space',
    typeName: CATEGORY_NAMES['special-space'],
    description: 'One-fifth em space. Sometimes leaks from LLM outputs.',
  },
  {
    codePoint: 0x200a,
    hexCode: makeHex(0x200a),
    name: 'Hair Space',
    type: 'special-space',
    typeName: CATEGORY_NAMES['special-space'],
    description: 'Thinnest space in Unicode. Used in precision typography only.',
  },
  // --- Invisible Joiners & Operators ---
  {
    codePoint: 0x00ad,
    hexCode: makeHex(0x00ad),
    name: 'Soft Hyphen',
    type: 'invisible-joiner',
    typeName: CATEGORY_NAMES['invisible-joiner'],
    description: 'Invisible hyphen made visible only when wrapping breaks the word.',
  },
  {
    codePoint: 0x2061,
    hexCode: makeHex(0x2061),
    name: 'Function Application',
    type: 'invisible-joiner',
    typeName: CATEGORY_NAMES['invisible-joiner'],
    description: 'Invisible operator hinting that adjacent symbols are a function application.',
  },
  {
    codePoint: 0x2062,
    hexCode: makeHex(0x2062),
    name: 'Invisible Times',
    type: 'invisible-joiner',
    typeName: CATEGORY_NAMES['invisible-joiner'],
    description: 'Invisible multiplication sign between variables. Common in AI math output.',
  },
  {
    codePoint: 0x2063,
    hexCode: makeHex(0x2063),
    name: 'Invisible Separator',
    type: 'invisible-joiner',
    typeName: CATEGORY_NAMES['invisible-joiner'],
    description: 'Invisible comma between variables in math expressions.',
  },
  {
    codePoint: 0x2064,
    hexCode: makeHex(0x2064),
    name: 'Invisible Plus',
    type: 'invisible-joiner',
    typeName: CATEGORY_NAMES['invisible-joiner'],
    description: 'Invisible plus sign between mixed-fraction components.',
  },
  // --- Line & Paragraph Separators ---
  {
    codePoint: 0x2028,
    hexCode: makeHex(0x2028),
    name: 'Line Separator',
    type: 'separator',
    typeName: CATEGORY_NAMES['separator'],
    description: 'Line break that is NOT a newline. Breaks many text processors.',
  },
  {
    codePoint: 0x2029,
    hexCode: makeHex(0x2029),
    name: 'Paragraph Separator',
    type: 'separator',
    typeName: CATEGORY_NAMES['separator'],
    description: 'Paragraph break that is NOT a newline. Breaks JSON and SQL inserts.',
  },
  // --- Byte Order Mark ---
  {
    codePoint: 0xfeff,
    hexCode: makeHex(0xfeff),
    name: 'Zero-Width No-Break Space (BOM)',
    type: 'bom',
    typeName: CATEGORY_NAMES['bom'],
    description: 'Byte Order Mark; invisible at the start of text but visible mid-string.',
  },
];

/** Fast lookup map: codePoint -> definition. */
const HIDDEN_BY_CP: Map<number, HiddenCharDef> = new Map(
  HIDDEN_CHARS.map((c) => [c.codePoint, c])
);

/** Test whether a single code point is one of the hidden characters we detect. */
export function isHiddenChar(codePoint: number): boolean {
  return HIDDEN_BY_CP.has(codePoint);
}

/** Get the definition for a code point, or null if not hidden. */
export function getHiddenCharDef(codePoint: number): HiddenCharDef | null {
  return HIDDEN_BY_CP.get(codePoint) ?? null;
}

/**
 * Scan text for hidden Unicode characters.
 *
 * Iterates per code point using `Array.from(text)` so surrogate pairs and
 * astral-plane characters are handled correctly (Rules R-0203).
 */
export function scanText(text: string): ScanResult {
  const hits: ScanHit[] = [];
  const hitByType: Partial<Record<HiddenCharType, number>> = {};
  const hitByChar: Record<string, number> = {};
  const cleanChars: string[] = [];

  const codePoints = Array.from(text);
  for (let i = 0; i < codePoints.length; i++) {
    const cp = codePoints[i].codePointAt(0)!;
    const def = HIDDEN_BY_CP.get(cp);
    if (def) {
      hits.push({
        codePoint: def.codePoint,
        hexCode: def.hexCode,
        name: def.name,
        type: def.type,
        typeName: def.typeName,
        position: i,
      });
      hitByType[def.type] = (hitByType[def.type] ?? 0) + 1;
      hitByChar[def.hexCode] = (hitByChar[def.hexCode] ?? 0) + 1;
      // Skip the hidden char from clean output.
    } else {
      cleanChars.push(codePoints[i]);
    }
  }

  return {
    hits,
    cleanText: cleanChars.join(''),
    hitCount: hits.length,
    hitByType,
    hitByChar,
  };
}

/** Remove all hidden characters from text and return the clean string. */
export function cleanText(text: string): string {
  return scanText(text).cleanText;
}

/** Human-readable label for a category id. */
export function getCategoryName(type: HiddenCharType): string {
  return CATEGORY_NAMES[type];
}

/** Total number of distinct hidden characters this scanner detects. */
export const HIDDEN_CHAR_COUNT = HIDDEN_CHARS.length;
