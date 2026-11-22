/**
 * Official delivery-note PDF generator.
 *
 * Strategy: the ORIGINAL PDF (with variable text surgically removed by
 * tools/build_template.py) is loaded as-is, and only the variable values are
 * written on top, at coordinates measured from the original file.
 * => page size, margins, lines, logo, fixed labels and their fonts are the
 *    original objects, not a re-drawing.
 *
 * Fonts used for the variable values (same as the original):
 *   Helvetica  : header date, plate, weights, quantity     (PDF standard font)
 *   ArialMT    : serial number, entry/exit dates           (assets/fonts/arial.ttf)
 *   Albany WT J: Arabic names. Not freely available -> Arial (metric-compatible)
 *                is used unless assets/fonts/Albany*.ttf exists at build time.
 *   "طن" unit  : drawn with the ORIGINAL embedded Albany subset glyphs.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./format.js'), require('./arabic-shaper.js'));
  else (root.Masdar = root.Masdar || {}).PdfGenerator = factory(root.Masdar.Format, root.Masdar.ArabicShaper);
})(typeof self !== 'undefined' ? self : this, function (F, Shaper) {
  'use strict';

  const PAGE_H = 841.95;
  const top = (y) => PAGE_H - y; // convert top-based baseline to PDF user space

  /** Positions measured from documents/original-template.pdf (points). */
  const LAYOUT = {
    serial:     { x: 230.855, y: 697.439, font: 'arial' },                 // left edge, as original
    headerDate: { right: 507.78, y: top(184.38), font: 'helvetica' },
    carrier:    { right: 459.74, y: top(312.39), font: 'arabic' },
    driver:     { right: 459.74, y: top(338.11), font: 'arabic' },
    plate:      { right: 459.90, y: top(363.40), font: 'helvetica' },
    tare:       { right: 222.024, y: top(312.89), font: 'helvetica', unit: true },
    gross:      { right: 222.024, y: top(338.61), font: 'helvetica', unit: true },
    net:        { right: 222.024, y: top(364.34), font: 'helvetica', unit: true },
    quantity:   { right: 457.25, y: top(582.67), font: 'helvetica' },
    entryDate:  { right: 460.06, y: top(613.77), font: 'arial' },
    // The exit slot is narrow (label ends at x=126, border at x=30): value placed so it stays inside the frame.
    exitDate:   { right: 116.0, y: top(613.77), font: 'arial' },
    signature:  { right: 446.39, y: top(701.78), font: 'arabic' },

    // ---- additions requested after the original form (placed on the form's own grid) ----
    // The note number (number only, no label) centred under "Export" (Export spans x 122.97–157.65, baseline 139.99;
    // one form row = 25.72pt).
    serialUnderExport: { center: 140.31, y: top(139.99 + 25.72) },
    // "عرباي رقم:" row directly under "سيارة رقم:" - labels end at x 543.21, values end at x 459.90.
    trailerLabel: { right: 543.21, y: top(363.84 + 25.72) },
    trailer:      { right: 459.90, y: top(363.40 + 25.72), font: 'helvetica' },
    // Empty "التاريخ:" under "ضابط القبان" -> value aligned with "BY SYSTEM" above it.
    scaleDate:    { right: 222.03, y: top(437.54), font: 'helvetica' },
    // "أمر بيع رقم:" -> the delivery-note number, aligned with CEM I 52.5N / Bulk / quantity.
    salesOrder:   { right: 457.25, y: top(551.30), font: 'helvetica' },
  };
  const NAVY = [0, 0, 0.501];          // colour of every label in the original form
  const LABEL_COLON_GAP = 3.336;       // original: ":" sits one Helvetica space-width left of the label
  const FONT_SIZE = 12;
  const UNIT_OFFSET = 16.806;          // original: "طن" starts 16.806pt left of the number
  const UNIT_GLYPHS_HEX = '002B002C';  // "طن" in the original embedded Albany WT J subset

  const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

  function b64ToBytes(b64) {
    if (typeof Buffer !== 'undefined' && typeof window === 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /**
   * Values written on the document for a stored note.
   * All three dates are the date the note was recorded (as agreed).
   */
  function fieldValues(note) {
    const net = F.formatKgAsTons(note.netKg);
    return {
      serial: note.number,
      headerDate: F.headerDate(note.documentDate),
      carrier: note.carrierName || '',
      driver: note.driverName,
      plate: note.plateNumber,
      tare: F.formatKgAsTons(note.tareKg),
      gross: F.formatKgAsTons(note.grossKg),
      net,
      quantity: net,
      entryDate: F.slotDate(note.documentDate),
      exitDate: F.slotDate(note.documentDate),
      signature: note.driverName,
      trailer: note.trailerNumber || '',
      scaleDate: F.headerDate(note.documentDate),
      salesOrder: note.number,
    };
  }

  function createGenerator({ PDFLib, fontkit, assets }) {
    if (!PDFLib || !fontkit || !assets) throw new Error('PDF generator: missing PDFLib / fontkit / assets');
    const { PDFDocument, StandardFonts, rgb, PDFName, PDFDict, PDFHexString,
      pushGraphicsState, popGraphicsState, beginText, endText, setFontAndSize,
      moveText, showText, setFillingRgbColor } = PDFLib;

    const templateBytes = b64ToBytes(assets.template);
    const arialBytes = b64ToBytes(assets.arial);
    const albanyBytes = assets.albany ? b64ToBytes(assets.albany) : null;
    const BLACK = rgb(0, 0, 0);

    /** Resource name of the original embedded Albany subset (normally "C2_0"). */
    function findAlbanyResource(page) {
      const fonts = page.node.Resources().lookup(PDFName.of('Font'), PDFDict);
      for (const [name, ref] of fonts.entries()) {
        const dict = page.doc.context.lookup(ref, PDFDict);
        const base = dict.get(PDFName.of('BaseFont'));
        if (base && /Albany/i.test(base.toString())) return name;
      }
      return null;
    }

    function drawUnit(page, albanyRes, x, y) {
      page.pushOperators(
        pushGraphicsState(),
        beginText(),
        setFillingRgbColor(0, 0, 0),
        setFontAndSize(albanyRes, FONT_SIZE),
        moveText(x, y),
        showText(PDFHexString.of(UNIT_GLYPHS_HEX)),
        endText(),
        popGraphicsState(),
      );
    }

    const subset = assets.albanySubset && !albanyBytes ? assets.albanySubset : null;
    const HELV_SPACE = 0.278 * FONT_SIZE; // the original separates Arabic words with Helvetica spaces

    /**
     * Write Arabic text with the ORIGINAL embedded Albany WT J glyphs (exactly how the
     * official PDF encodes names). Returns false if a letter-form is missing from the
     * subset, in which case the caller falls back to a full font.
     */
    /** Width of text in the original Albany subset, or null if a letter-form is missing. */
    function originalWidth(text) {
      if (!subset || !text) return null;
      let total = 0;
      const words = Shaper.shapeVisualWords(text);
      for (const forms of words) {
        for (const ch of forms) {
          const g = subset.glyphs[ch];
          if (!g) return null;
          total += g[1] * FONT_SIZE;
        }
      }
      return total + HELV_SPACE * (words.length - 1);
    }

    function drawWithOriginalGlyphs(page, albanyRes, text, right, y, color = [0, 0, 0]) {
      if (!subset || !albanyRes || !text) return false;
      const words = Shaper.shapeVisualWords(text);
      const encoded = [];
      for (const forms of words) {
        let hex = '';
        let width = 0;
        for (const ch of forms) {
          const g = subset.glyphs[ch];
          if (!g) return false;
          hex += g[0].toString(16).padStart(4, '0').toUpperCase();
          width += g[1] * FONT_SIZE;
        }
        encoded.push({ hex, width });
      }
      let cursor = right;
      for (const w of encoded) {
        const x = cursor - w.width;
        page.pushOperators(
          pushGraphicsState(), beginText(), setFillingRgbColor(color[0], color[1], color[2]),
          setFontAndSize(albanyRes, FONT_SIZE), moveText(x, y),
          showText(PDFHexString.of(w.hex)), endText(), popGraphicsState(),
        );
        cursor = x - HELV_SPACE;
      }
      return true;
    }

    /**
     * Right-aligned text that may contain Arabic. Arabic words are shaped by fontkit;
     * words are laid out right-to-left; runs of Latin/digit words keep LTR order.
     */
    function rtlWidth(text, fonts) {
      const space = fonts.arial.widthOfTextAtSize(' ', FONT_SIZE);
      return text.split(' ').filter(Boolean).reduce((s, w, i) => {
        const font = ARABIC_RE.test(w) ? fonts.arabic : fonts.arial;
        let width;
        try { width = font.widthOfTextAtSize(w, FONT_SIZE); } catch (_) { width = fonts.arial.widthOfTextAtSize(w, FONT_SIZE); }
        return s + width + (i ? space : 0);
      }, 0);
    }

    function drawRtl(page, text, right, y, fonts, color = BLACK) {
      if (!text) return;
      if (!ARABIC_RE.test(text)) {
        const w = fonts.arial.widthOfTextAtSize(text, FONT_SIZE);
        page.drawText(text, { x: right - w, y, size: FONT_SIZE, font: fonts.arial, color });
        return;
      }
      const words = text.split(' ').filter(Boolean);
      const runs = [];
      for (const w of words) {
        const rtl = ARABIC_RE.test(w);
        const last = runs[runs.length - 1];
        if (!rtl && last && !last.rtl) last.text += ' ' + w;
        else runs.push({ text: w, rtl });
      }
      const space = fonts.arial.widthOfTextAtSize(' ', FONT_SIZE);
      let cursor = right;
      for (const run of runs) {
        let font = run.rtl ? fonts.arabic : fonts.arial;
        let width;
        try { width = font.widthOfTextAtSize(run.text, FONT_SIZE); } catch (_) {
          font = fonts.arial; width = font.widthOfTextAtSize(run.text, FONT_SIZE);
        }
        page.drawText(run.text, { x: cursor - width, y, size: FONT_SIZE, font, color });
        cursor -= width + space;
      }
    }

    function drawRight(page, text, right, y, font) {
      const w = font.widthOfTextAtSize(text, FONT_SIZE);
      page.drawText(text, { x: right - w, y, size: FONT_SIZE, font, color: BLACK });
      return right - w;
    }

    /** @returns {Promise<Uint8Array>} PDF bytes */
    async function generate(note) {
      const doc = await PDFDocument.load(templateBytes);
      doc.registerFontkit(fontkit);
      const helvetica = await doc.embedFont(StandardFonts.Helvetica);
      const arial = await doc.embedFont(arialBytes, { subset: true });
      const arabic = albanyBytes ? await doc.embedFont(albanyBytes, { subset: true }) : arial;
      const fonts = { helvetica, arial, arabic };
      const page = doc.getPage(0);
      const albanyRes = findAlbanyResource(page);
      const v = fieldValues(note);

      // Serial number: digits only, no "رقم", at the original x position.
      page.drawText(v.serial, { x: LAYOUT.serial.x, y: LAYOUT.serial.y, size: FONT_SIZE, font: arial, color: BLACK });
      drawRight(page, v.headerDate, LAYOUT.headerDate.right, LAYOUT.headerDate.y, helvetica);
      const arabicField = (text, L) => {
        if (!drawWithOriginalGlyphs(page, albanyRes, text, L.right, L.y)) drawRtl(page, text, L.right, L.y, fonts);
      };
      arabicField(v.carrier, LAYOUT.carrier);
      arabicField(v.driver, LAYOUT.driver);
      drawRight(page, v.plate, LAYOUT.plate.right, LAYOUT.plate.y, helvetica);
      for (const key of ['tare', 'gross', 'net']) {
        const L = LAYOUT[key];
        const left = drawRight(page, v[key], L.right, L.y, helvetica);
        if (albanyRes) drawUnit(page, albanyRes, left - UNIT_OFFSET, L.y);
        else drawRtl(page, 'طن', left - 3.336, L.y, fonts);
      }
      drawRight(page, v.quantity, LAYOUT.quantity.right, LAYOUT.quantity.y, helvetica);
      drawRight(page, v.entryDate, LAYOUT.entryDate.right, LAYOUT.entryDate.y, arial);
      drawRight(page, v.exitDate, LAYOUT.exitDate.right, LAYOUT.exitDate.y, arial);
      arabicField(v.signature, LAYOUT.signature);

      // ---- additions ----
      const navy = rgb(NAVY[0], NAVY[1], NAVY[2]);
      /** Navy Arabic label, right-aligned, followed by its ":" like the form's own labels. Returns x of the colon's left edge. */
      const drawLabel = (text, right, y) => {
        let width = originalWidth(text);
        if (width != null && albanyRes) drawWithOriginalGlyphs(page, albanyRes, text, right, y, NAVY);
        else { width = rtlWidth(text, fonts); drawRtl(page, text, right, y, fonts, navy); }
        const colonX = right - width - LABEL_COLON_GAP;
        page.drawText(':', { x: colonX, y, size: FONT_SIZE, font: helvetica, color: navy });
        return colonX;
      };

      // 1) the delivery-note number alone, centred under "Export"
      {
        const L = LAYOUT.serialUnderExport;
        const numW = arial.widthOfTextAtSize(v.serial, FONT_SIZE);
        page.drawText(v.serial, { x: L.center - numW / 2, y: L.y, size: FONT_SIZE, font: arial, color: BLACK });
      }
      // 2) "عرباي رقم:" under "سيارة رقم:" + the trailer number
      drawLabel('عرباي رقم', LAYOUT.trailerLabel.right, LAYOUT.trailerLabel.y);
      if (v.trailer) drawRight(page, v.trailer, LAYOUT.trailer.right, LAYOUT.trailer.y, helvetica);
      // 3) date in the "التاريخ:" field of the weighbridge box
      drawRight(page, v.scaleDate, LAYOUT.scaleDate.right, LAYOUT.scaleDate.y, helvetica);
      // 4) "أمر بيع رقم:" = the delivery-note number
      drawRight(page, v.salesOrder, LAYOUT.salesOrder.right, LAYOUT.salesOrder.y, helvetica);

      doc.setTitle(`Delivery Note ${note.number}`);
      doc.setSubject('سند تسليم');
      doc.setProducer('MASDAR Delivery Notes');
      doc.setCreator('MASDAR Delivery Notes');
      doc.setCreationDate(new Date(note.createdAt));
      doc.setModificationDate(new Date(note.lastEditedAt || note.createdAt));
      return doc.save({ useObjectStreams: false });
    }

    function fileName(note) {
      return `DeliveryNote-${note.number}.pdf`;
    }

    /** true if this text will be written with the original Albany glyphs (no font substitution). */
    function coveredByOriginalFont(text) {
      if (albanyBytes) return true;
      if (!subset || !text) return false;
      return Shaper.shapeVisualWords(text).every((forms) => forms.every((ch) => subset.glyphs[ch]));
    }

    return { generate, fileName, fieldValues, coveredByOriginalFont, LAYOUT, usesOriginalArabicFont: !!albanyBytes };
  }

  return { createGenerator, fieldValues, LAYOUT };
});
