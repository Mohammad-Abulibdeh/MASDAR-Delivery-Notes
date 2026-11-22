/**
 * Minimal Arabic shaper: logical Arabic text -> contextual presentation forms
 * (U+FE70–U+FEFF) in VISUAL (left-to-right) order, word by word.
 * Used to write names with the ORIGINAL embedded "Albany WT J" glyphs of the
 * official template, exactly the way the original PDF encodes Arabic text.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.Masdar = root.Masdar || {}).ArabicShaper = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // [isolated, final, initial, medial]; 2 entries = joins only to the previous letter.
  const FORMS = {
    'ء': ['ﺀ'],
    'آ': ['ﺁ', 'ﺂ'], 'أ': ['ﺃ', 'ﺄ'], 'ؤ': ['ﺅ', 'ﺆ'],
    'إ': ['ﺇ', 'ﺈ'], 'ئ': ['ﺉ', 'ﺊ', 'ﺋ', 'ﺌ'],
    'ا': ['ﺍ', 'ﺎ'], 'ب': ['ﺏ', 'ﺐ', 'ﺑ', 'ﺒ'],
    'ة': ['ﺓ', 'ﺔ'], 'ت': ['ﺕ', 'ﺖ', 'ﺗ', 'ﺘ'],
    'ث': ['ﺙ', 'ﺚ', 'ﺛ', 'ﺜ'], 'ج': ['ﺝ', 'ﺞ', 'ﺟ', 'ﺠ'],
    'ح': ['ﺡ', 'ﺢ', 'ﺣ', 'ﺤ'], 'خ': ['ﺥ', 'ﺦ', 'ﺧ', 'ﺨ'],
    'د': ['ﺩ', 'ﺪ'], 'ذ': ['ﺫ', 'ﺬ'],
    'ر': ['ﺭ', 'ﺮ'], 'ز': ['ﺯ', 'ﺰ'],
    'س': ['ﺱ', 'ﺲ', 'ﺳ', 'ﺴ'], 'ش': ['ﺵ', 'ﺶ', 'ﺷ', 'ﺸ'],
    'ص': ['ﺹ', 'ﺺ', 'ﺻ', 'ﺼ'], 'ض': ['ﺽ', 'ﺾ', 'ﺿ', 'ﻀ'],
    'ط': ['ﻁ', 'ﻂ', 'ﻃ', 'ﻄ'], 'ظ': ['ﻅ', 'ﻆ', 'ﻇ', 'ﻈ'],
    'ع': ['ﻉ', 'ﻊ', 'ﻋ', 'ﻌ'], 'غ': ['ﻍ', 'ﻎ', 'ﻏ', 'ﻐ'],
    'ف': ['ﻑ', 'ﻒ', 'ﻓ', 'ﻔ'], 'ق': ['ﻕ', 'ﻖ', 'ﻗ', 'ﻘ'],
    'ك': ['ﻙ', 'ﻚ', 'ﻛ', 'ﻜ'], 'ل': ['ﻝ', 'ﻞ', 'ﻟ', 'ﻠ'],
    'م': ['ﻡ', 'ﻢ', 'ﻣ', 'ﻤ'], 'ن': ['ﻥ', 'ﻦ', 'ﻧ', 'ﻨ'],
    'ه': ['ﻩ', 'ﻪ', 'ﻫ', 'ﻬ'], 'و': ['ﻭ', 'ﻮ'],
    'ى': ['ﻯ', 'ﻰ'], 'ي': ['ﻱ', 'ﻲ', 'ﻳ', 'ﻴ'],
  };
  // lam + alef ligatures: [isolated, final]
  const LAM_ALEF = {
    'آ': ['ﻵ', 'ﻶ'], 'أ': ['ﻷ', 'ﻸ'],
    'إ': ['ﻹ', 'ﻺ'], 'ا': ['ﻻ', 'ﻼ'],
  };
  const LAM = 'ل';
  const HARAKAT = /[ً-ْٰـ]/g; // diacritics + tatweel

  const isDual = (c) => FORMS[c] && FORMS[c].length === 4;
  const joins = (c) => FORMS[c] && FORMS[c].length >= 2;

  /** Shape one word (logical order) -> array of presentation forms in LOGICAL order. */
  function shapeWord(word) {
    const chars = Array.from(word.replace(HARAKAT, ''));
    const out = [];
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (!FORMS[c]) { out.push(c); continue; }
      const prev = chars[i - 1];
      const prevJoins = !!prev && isDual(prev); // after a lam-alef ligature prev is the alef -> no join
      if (c === LAM && LAM_ALEF[chars[i + 1]]) {
        out.push(LAM_ALEF[chars[i + 1]][prevJoins ? 1 : 0]);
        i++;
        continue;
      }
      const next = chars[i + 1];
      const nextJoins = !!next && joins(next) && isDual(c);
      let form;
      if (prevJoins && nextJoins) form = FORMS[c][3];
      else if (prevJoins) form = FORMS[c][1];
      else if (nextJoins) form = FORMS[c][2];
      else form = FORMS[c][0];
      out.push(form);
    }
    return out;
  }

  /** Words in logical order, each as presentation forms in VISUAL (LTR) order. */
  function shapeVisualWords(text) {
    return String(text).trim().split(/\s+/).filter(Boolean).map((w) => shapeWord(w).reverse());
  }

  return { shapeWord, shapeVisualWords };
});
