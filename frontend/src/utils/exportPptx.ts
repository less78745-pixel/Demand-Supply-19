/**
 * Reusable "Export to PowerPoint" pipeline: capture live chart DOM nodes as
 * high-res images (SnapDOM), then compose each with its own insight text
 * panel into a .pptx deck — one slide per chart, or a full-width text-only
 * slide for insights/conclusions that have no chart of their own (pptxgenjs).
 * Works entirely client-side — no backend round-trip — so it always reflects
 * whatever filters are currently applied on screen.
 *
 * Use `generateMultiSlidePptx` for modules with more than one chart/insight
 * (the deck should carry every chart + insight in the module, excluding
 * raw-data tables — a table's own written conclusion is fine as a text-only
 * slide, the row grid itself is not). `generatePptx` remains for the
 * single-chart case.
 *
 * Both libraries are dynamically imported (same lazy-load pattern as
 * `exportToExcel` in `export.ts`) so pages that never trigger a PPTX export
 * don't ship extra JS in their initial bundle.
 *
 * We use `@zumer/snapdom` rather than html2canvas: html2canvas *redraws* the
 * DOM procedurally onto a `<canvas>`, which is why it garbles text whose web
 * font hadn't finished loading yet and is slow on complex cards. SnapDOM
 * instead serializes the DOM (styles, pseudo-elements, fonts) and rasterizes
 * that — with `embedFonts: true` it inlines the actual `@font-face` the
 * element uses, so labels render with the real font instead of overlapping
 * fallback-metric glyphs.
 */

export interface GeneratePptxOptions {
  /** DOM node to snapshot (e.g. the chart's wrapping <div>, not the page). */
  chartElement: HTMLElement;
  /** Insight/analysis text. One bullet point per line (split on '\n'). */
  insightText: string;
  /** Slide title — should reflect the active filters for traceability. */
  slideTitle: string;
  /** Output filename, with or without the .pptx extension. */
  fileName: string;
  /** SnapDOM render scale. 3 ≈ print-sharp; drop to 2 if file size matters. */
  scale?: number;
  /** Background behind the captured chart. Omit to auto-detect the chart's
   *  own ancestor background (recommended — see `detectBackgroundColor`);
   *  only pass this to force one color across a whole deck. */
  backgroundColor?: string;
}

/**
 * Walk up from `element` to find the nearest ancestor with an actual visible
 * background (solid color, or the first color stop of a gradient), and use
 * that as the capture's fill color.
 *
 * Chart wrapper divs (e.g. `<div ref={chartRef} className="h-[360px] w-full">`)
 * are usually themselves transparent, inheriting a dark or light card
 * background from an ancestor `GlassCard`. Forcing one hardcoded color (e.g.
 * white) across every module breaks any chart whose axis/legend colors were
 * designed for the opposite theme — light slate tick labels vanish against a
 * white fill, exactly like a dark-card chart forced onto white. Auto-detecting
 * per element keeps every chart's own light/dark card colors intact.
 */
function detectBackgroundColor(element: HTMLElement): string {
  let el: HTMLElement | null = element;
  while (el) {
    const style = getComputedStyle(el);

    const bg = style.backgroundColor;
    const rgbaMatch = bg.match(/rgba?\(([^)]+)\)/);
    if (rgbaMatch) {
      const parts = rgbaMatch[1].split(',').map((s) => parseFloat(s.trim()));
      const alpha = parts.length === 4 ? parts[3] : 1;
      if (alpha > 0.05) return bg;
    }

    const bgImage = style.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      const colorInGradient = bgImage.match(/rgba?\([^)]+\)/);
      if (colorInGradient) return colorInGradient[0];
    }

    el = el.parentElement;
  }
  return '#020617';
}

/**
 * Walk `root` and every descendant, and where content is actually being
 * clipped (scrollHeight/scrollWidth exceeds the visible client box — e.g. a
 * `max-h-40 overflow-y-auto` legend list, or a single-line `truncate` label)
 * temporarily relax that clipping so the full content lays out and can be
 * captured. Returns a restore function that puts every touched inline style
 * back exactly as it was.
 *
 * This has to run on the live DOM (not a captured clone) so the browser
 * actually reflows the real layout — a list that only shows 4 of 8 rows
 * on screen needs to render all 8 before any capture step sees them.
 */
function relaxClippedDescendants(root: HTMLElement): () => void {
  const restores: Array<() => void> = [];
  const candidates: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];

  for (const el of candidates) {
    const clippedY = el.scrollHeight > el.clientHeight + 1;
    const clippedX = el.scrollWidth > el.clientWidth + 1;
    if (!clippedY && !clippedX) continue;

    const prev = {
      overflow: el.style.overflow,
      overflowX: el.style.overflowX,
      overflowY: el.style.overflowY,
      maxHeight: el.style.maxHeight,
      maxWidth: el.style.maxWidth,
      height: el.style.height,
      whiteSpace: el.style.whiteSpace,
      textOverflow: el.style.textOverflow,
    };
    restores.push(() => {
      el.style.overflow = prev.overflow;
      el.style.overflowX = prev.overflowX;
      el.style.overflowY = prev.overflowY;
      el.style.maxHeight = prev.maxHeight;
      el.style.maxWidth = prev.maxWidth;
      el.style.height = prev.height;
      el.style.whiteSpace = prev.whiteSpace;
      el.style.textOverflow = prev.textOverflow;
    });

    if (clippedY) {
      el.style.maxHeight = 'none';
      el.style.overflowY = 'visible';
      if (/px$/.test(el.style.height)) el.style.height = 'auto';
    }
    if (clippedX) {
      // Truncated single-line labels (Tailwind `truncate`): let them wrap
      // onto a second line inside their own box instead of spilling sideways
      // into neighboring elements.
      el.style.maxWidth = 'none';
      el.style.overflowX = 'visible';
      el.style.whiteSpace = 'normal';
      el.style.textOverflow = 'clip';
    }
    el.style.overflow = 'visible';
  }

  return () => {
    for (let i = restores.length - 1; i >= 0; i--) restores[i]();
  };
}

/**
 * Render `chartElement` to a high-resolution PNG data URL.
 *
 * Chart cards are sized for on-screen viewing (a fixed Tailwind height like
 * `h-[360px]`, or a nested `max-h-40 overflow-y-auto` legend list), which is
 * often too tight once Recharts lays out rotated axis labels or a full
 * legend — those get clipped at the card's own edge in a naive snapshot.
 * Before capturing we (1) relax any actually-clipped descendant so the full
 * content lays out, then (2) temporarily grow the whole element (extra
 * height/width headroom, `overflow: visible`) and wait two animation frames
 * so Recharts' `ResponsiveContainer` (which redraws on a `ResizeObserver`)
 * re-lays-out its SVG with the extra room, then snapshot and restore every
 * touched inline style. This all happens on the real, live element — a
 * capture-time clone can't be resized enough to make Recharts redraw itself.
 */
export async function captureElementAsImage(
  element: HTMLElement,
  scale: number = 3,
  backgroundColor?: string,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const { snapdom } = await import('@zumer/snapdom');

  const resolvedBackgroundColor = backgroundColor ?? detectBackgroundColor(element);
  const restoreClipping = relaxClippedDescendants(element);

  const originalStyle = {
    height: element.style.height,
    minHeight: element.style.minHeight,
    width: element.style.width,
    minWidth: element.style.minWidth,
    overflow: element.style.overflow,
  };

  // Headroom so rotated/long axis labels and a wrapping legend have room to
  // render fully instead of being clipped at the card's original edge.
  const HEADROOM_PX = 64;
  const naturalWidth = Math.max(element.scrollWidth, element.clientWidth);
  const naturalHeight = Math.max(element.scrollHeight, element.clientHeight);

  element.style.height = `${naturalHeight + HEADROOM_PX}px`;
  element.style.minHeight = `${naturalHeight + HEADROOM_PX}px`;
  element.style.width = `${naturalWidth}px`;
  element.style.minWidth = `${naturalWidth}px`;
  element.style.overflow = 'visible';

  // Two rAFs: one for the ResizeObserver callback to fire, one for the
  // resulting React re-render (Recharts redraws its SVG) to commit.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  try {
    const canvas = await snapdom.toCanvas(element, {
      scale,
      backgroundColor: resolvedBackgroundColor,
      embedFonts: true,
    });
    return {
      dataUrl: canvas.toDataURL('image/png', 1.0),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    element.style.height = originalStyle.height;
    element.style.minHeight = originalStyle.minHeight;
    element.style.width = originalStyle.width;
    element.style.minWidth = originalStyle.minWidth;
    element.style.overflow = originalStyle.overflow;
    restoreClipping();
  }
}

/**
 * One slide's worth of content, for the multi-slide deck builder.
 *
 * Leave `chartElement` unset for a text-only slide (a conclusion/insight
 * that isn't backed by its own chart, e.g. a summary of a table that stays
 * out of the deck otherwise) — it renders as full-width bullets with no
 * image.
 */
export interface PptxSlideSpec {
  /** DOM node to snapshot (e.g. the chart's wrapping <div>, not the page).
   *  Omit for a text-only insight/conclusion slide. */
  chartElement?: HTMLElement | null;
  /** Insight/analysis text. One bullet point per line (split on '\n'). */
  insightText: string;
  /** Slide title — should reflect the active filters for traceability. */
  slideTitle: string;
}

export interface GenerateMultiSlidePptxOptions {
  /** One slide per chart+insight (or text-only insight) entry, in order. */
  slides: PptxSlideSpec[];
  /** Output filename, with or without the .pptx extension. */
  fileName: string;
  /** SnapDOM render scale. 3 ≈ print-sharp; drop to 2 if file size matters. */
  scale?: number;
  /** Background forced across every chart in the deck. Omit (recommended)
   *  to auto-detect each chart's own ancestor background per slide — see
   *  `detectBackgroundColor`. Only set this to force one color everywhere. */
  backgroundColor?: string;
}

function bulletsFrom(lines: string[]) {
  return lines.map((line) => ({ text: line, options: { bullet: true, breakLine: true } }));
}

function splitInsightLines(insightText: string): string[] {
  return insightText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * A long insight list (many bullets, or a few very long ones) can visually
 * overflow past the bottom/right of its text box — PowerPoint doesn't clip
 * or shrink text to fit by default, it just renders past the box's nominal
 * size. Rather than guess at font sizing, paginate: split `lines` into
 * chunks that comfortably fit one slide/panel each, weighting each line by
 * its estimated wrapped height (`charsPerLine`) so a handful of long
 * paragraphs doesn't get treated the same as a handful of short ones.
 */
function paginateLines(lines: string[], charsPerLine: number, maxUnitsPerPage: number): string[][] {
  const pages: string[][] = [];
  let current: string[] = [];
  let currentUnits = 0;

  for (const line of lines) {
    const units = Math.max(1, Math.ceil(line.length / charsPerLine));
    if (current.length > 0 && currentUnits + units > maxUnitsPerPage) {
      pages.push(current);
      current = [];
      currentUnits = 0;
    }
    current.push(line);
    currentUnits += units;
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

// Conservative capacity estimates for the two insight-text layouts below —
// tuned so a page of bullets stays inside its box even when several lines
// wrap onto a second visual line.
const TEXT_ONLY_CHARS_PER_LINE = 90;
const TEXT_ONLY_MAX_UNITS_PER_PAGE = 9;
const PANEL_CHARS_PER_LINE = 40;
const PANEL_MAX_UNITS_PER_PAGE = 9;

function addChartSlide(
  pres: any,
  slideTitle: string,
  panelLines: string[],
  image: { dataUrl: string; width: number; height: number },
) {
  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };

  slide.addText(slideTitle, {
    x: 0.4, y: 0.25, w: 12.3, h: 0.8,
    fontSize: 24, bold: true, color: '1F2937', fontFace: 'Calibri',
  });

  // Fit the captured image into the left ~65% of the slide, preserving
  // aspect ratio so the chart never looks stretched/squashed.
  const maxW = 8.2;
  const maxH = 5.8;
  const aspect = image.width / image.height;
  let imgW = maxW;
  let imgH = imgW / aspect;
  if (imgH > maxH) {
    imgH = maxH;
    imgW = imgH * aspect;
  }

  slide.addImage({
    data: image.dataUrl,
    x: 0.4,
    y: 1.2 + (maxH - imgH) / 2,
    w: imgW,
    h: imgH,
  });

  slide.addText('Key Insight', {
    x: 8.9, y: 1.2, w: 4.0, h: 0.5,
    fontSize: 18, bold: true, color: '2563EB', fontFace: 'Calibri',
  });

  slide.addText(bulletsFrom(panelLines), {
    x: 8.9, y: 1.8, w: 4.0, h: 5.2,
    fontSize: 13, color: '374151', fontFace: 'Calibri',
    valign: 'top', paraSpaceAfter: 8, fit: 'shrink',
  });
}

/** Full-width text-only slide for a chart-less insight/conclusion. */
function addTextOnlySlide(pres: any, slideTitle: string, lines: string[]) {
  const slide = pres.addSlide();
  slide.background = { color: 'FFFFFF' };

  slide.addText(slideTitle, {
    x: 0.4, y: 0.25, w: 12.3, h: 0.8,
    fontSize: 24, bold: true, color: '1F2937', fontFace: 'Calibri',
  });

  slide.addText('Key Insight', {
    x: 0.4, y: 1.2, w: 12.3, h: 0.5,
    fontSize: 18, bold: true, color: '2563EB', fontFace: 'Calibri',
  });

  slide.addText(bulletsFrom(lines), {
    x: 0.4, y: 1.8, w: 12.3, h: 5.2,
    fontSize: 16, color: '374151', fontFace: 'Calibri',
    valign: 'top', paraSpaceAfter: 10, fit: 'shrink',
  });
}

/**
 * Capture every slide's chart (in parallel) and assemble the PptxGenJS
 * presentation object — shared by the "download directly" and "hand me the
 * bytes" entry points below. Each chart's own background is auto-detected
 * per slide unless `backgroundColor` is set, forcing one color everywhere.
 */
async function buildPresentation(
  slides: PptxSlideSpec[],
  scale: number,
  backgroundColor: string | undefined,
): Promise<any> {
  if (!slides || slides.length === 0) {
    throw new Error('Tidak ada grafik atau insight untuk diekspor.');
  }

  const [{ default: PptxGenJS }, images] = await Promise.all([
    import('pptxgenjs'),
    Promise.all(
      slides.map((s) => (s.chartElement ? captureElementAsImage(s.chartElement, scale, backgroundColor) : null)),
    ),
  ]);

  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pres.layout = 'WIDE';

  slides.forEach((spec, i) => {
    const image = images[i];
    const lines = splitInsightLines(spec.insightText);

    if (image) {
      // Chart stays on the first slide; if its insight panel has more than
      // one page's worth of bullets, the chart image is NOT repeated on the
      // overflow pages — those become full-width text-only continuation
      // slides, so the deck doesn't carry a duplicate picture per page.
      const panelPages = paginateLines(lines, PANEL_CHARS_PER_LINE, PANEL_MAX_UNITS_PER_PAGE);
      addChartSlide(pres, spec.slideTitle, panelPages[0] ?? [], image);
      for (let p = 1; p < panelPages.length; p++) {
        addTextOnlySlide(
          pres,
          `${spec.slideTitle} — Insight Lanjutan (${p + 1}/${panelPages.length})`,
          panelPages[p],
        );
      }
    } else {
      const textPages = paginateLines(lines, TEXT_ONLY_CHARS_PER_LINE, TEXT_ONLY_MAX_UNITS_PER_PAGE);
      textPages.forEach((pageLines, p) => {
        addTextOnlySlide(
          pres,
          textPages.length > 1 ? `${spec.slideTitle} (${p + 1}/${textPages.length})` : spec.slideTitle,
          pageLines,
        );
      });
    }
  });

  return pres;
}

/**
 * Build a multi-slide .pptx and return it as a `Blob` instead of triggering
 * a download — for callers that need to bundle it alongside other files
 * (e.g. into one .zip with the HTML/Excel export) rather than downloading it
 * as a separate file.
 */
export async function generateMultiSlidePptxBlob({
  slides,
  scale = 3,
  backgroundColor,
}: Omit<GenerateMultiSlidePptxOptions, 'fileName'>): Promise<Blob> {
  const pres = await buildPresentation(slides, scale, backgroundColor);
  const blob = await pres.write({ outputType: 'blob' });
  return blob as Blob;
}

/**
 * Build and download a multi-slide .pptx: one slide per entry in `slides`,
 * in order — a chart+insight slide when `chartElement` is set, a full-width
 * text-only insight slide otherwise. This is the deck builder every module
 * should use so a full export carries every chart and insight in the module
 * (raw-data tables are intentionally excluded — they belong in the Excel
 * export, not the deck; a table's own conclusion can still appear as a
 * text-only slide).
 */
export async function generateMultiSlidePptx({
  slides,
  fileName,
  scale = 3,
  backgroundColor,
}: GenerateMultiSlidePptxOptions): Promise<void> {
  const pres = await buildPresentation(slides, scale, backgroundColor);
  const finalName = fileName.endsWith('.pptx') ? fileName : `${fileName}.pptx`;
  await pres.writeFile({ fileName: finalName });
}

/**
 * Build and download a single-slide .pptx: title on top, chart image on the
 * left, insight bullets on the right.
 *
 * Thin wrapper around `generateMultiSlidePptx` for the (now rare) case where
 * a module only ever has one chart to export.
 */
export async function generatePptx({
  chartElement,
  insightText,
  slideTitle,
  fileName,
  scale = 3,
  backgroundColor,
}: GeneratePptxOptions): Promise<void> {
  return generateMultiSlidePptx({
    slides: [{ chartElement, insightText, slideTitle }],
    fileName,
    scale,
    backgroundColor,
  });
}
