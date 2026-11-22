/**
 * Formatting & parsing helpers shared by the UI, storage and the PDF generator.
 * Weights are handled internally as INTEGER KILOGRAMS to avoid floating-point errors
 * (e.g. 77 - 22.78 = 54.22 exactly, never 54.219999…).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.Masdar = root.Masdar || {}).Format = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const pad = (n, len = 2) => String(n).padStart(len, '0');

  /** Convert Arabic-Indic / Persian digits and Arabic decimal separators to ASCII. */
  function normalizeDigits(str) {
    return String(str == null ? '' : str)
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
      .replace(/[٫،,]/g, '.');
  }

  /**
   * Parse a ton value typed by the user ("22.78", "٢٢٫٧٨") into integer kilograms.
   * Returns null when the input is not a valid non-negative number with at most 3 decimals.
   */
  function parseTonsToKg(input) {
    const s = normalizeDigits(input).trim();
    if (!/^\d{1,4}(\.\d{0,3})?$/.test(s)) return null;
    const [intPart, frac = ''] = s.split('.');
    return parseInt(intPart, 10) * 1000 + parseInt((frac + '000').slice(0, 3), 10);
  }

  /** 54220 -> "54.22", 77000 -> "77", 22780 -> "22.78" (same style as the official PDF). */
  function formatKgAsTons(kg) {
    if (kg == null || !Number.isFinite(kg)) return '';
    const sign = kg < 0 ? '-' : '';
    const abs = Math.abs(Math.round(kg));
    const whole = Math.floor(abs / 1000);
    const frac = pad(abs % 1000, 3).replace(/0+$/, '');
    return sign + whole + (frac ? '.' + frac : '');
  }

  /** Local-time snapshot that never shifts with time-zone changes once stored. */
  function localStamp(d = new Date()) {
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
      iso: d.toISOString(),
    };
  }

  function splitDate(ymd) {
    const [y, m, d] = String(ymd).split('-').map((v) => parseInt(v, 10));
    return { y, m, d };
  }

  /**
   * THE single date format of the system (PDF + website): "2026-11-12" -> "12/NOV/26".
   * DD / English month abbreviation / YY.
   */
  function displayDate(ymd) {
    if (!ymd) return '';
    const { y, m, d } = splitDate(ymd);
    return `${pad(d)}/${MONTHS[m - 1]}/${pad(y % 100)}`;
  }

  /** PDF header "التاريخ" field. */
  const headerDate = displayDate;
  /** PDF "وقت الدخول" / "وقت الخروج" fields. */
  const slotDate = displayDate;

  /** "2026-11-12" -> "1211" (DDMM prefix of the serial number). */
  function dayKey(ymd) {
    const { m, d } = splitDate(ymd);
    return `${pad(d)}${pad(m)}`;
  }

  /** ("1211", 0) -> "1211000" */
  function serialNumber(key, seq) {
    return `${key}${pad(seq, 3)}`;
  }

  /**
   * Date shown in the website - same format as the document, wrapped in an
   * LTR isolate (U+2066…U+2069) so Arabic RTL text never reorders it to "NOV/26/12".
   */
  function uiDate(ymd) {
    return ymd ? `⁦${displayDate(ymd)}⁩` : '';
  }

  function uiTime(hms) {
    return hms ? String(hms).slice(0, 5) : '';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /** Collapse whitespace, trim. */
  function cleanText(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  return {
    MONTHS, pad, normalizeDigits, parseTonsToKg, formatKgAsTons, localStamp,
    displayDate, headerDate, slotDate, dayKey, serialNumber, uiDate, uiTime, escapeHtml, cleanText,
  };
});
