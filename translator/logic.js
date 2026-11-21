// Übersetzer – logic without DOM (languages, Opus-MT routes, splitting text into pieces).
// Loaded as a classic script before the page script (window.TranslatorLogic).
(function (root) {
  'use strict';

  // Languages offered in the app (BCP 47 base codes). Names come from Intl.DisplayNames in the UI language.
  // The browser's Translator API decides per pair whether it can translate; the Opus-MT fallback can
  // translate a pair when OPUS_MODELS has a direct model or both halves of a route through English.
  const LANGS = ['de', 'en', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'cs', 'da', 'sv', 'fi', 'hu', 'ro',
    'ru', 'uk', 'tr', 'ar', 'hi', 'id', 'vi', 'zh', 'ja', 'ko'];

  // Models of the Opus-MT family (Helsinki-NLP, converted to ONNX as Xenova/opus-mt-<from>-<to>) that this
  // app uses. Only pairs that exist on Hugging Face – checked against the Hub when the list was made.
  const OPUS_MODELS = [
    'de-en', 'en-de', 'fr-en', 'en-fr', 'es-en', 'en-es', 'it-en', 'en-it', 'nl-en', 'en-nl',
    'cs-en', 'en-cs', 'da-en', 'en-da', 'sv-en', 'en-sv', 'fi-en', 'en-fi', 'hu-en', 'en-hu',
    'ru-en', 'en-ru', 'uk-en', 'en-uk', 'ar-en', 'en-ar', 'hi-en', 'en-hi', 'id-en', 'en-id',
    'vi-en', 'en-vi', 'zh-en', 'en-zh', 'en-ro', 'ja-en', 'ko-en', 'pl-en', 'tr-en',
    'de-fr', 'fr-de', 'de-es', 'es-de', 'es-fr', 'fr-es', 'es-it', 'it-es', 'it-fr',
  ];
  const OPUS = new Set(OPUS_MODELS);
  const repo = pair => 'Xenova/opus-mt-' + pair;
  // One-time download per model with dtype q8: encoder + merged decoder ~105 MB on average, tokenizer ~5 MB
  const OPUS_MB = 110;

  /** Models (Hugging Face repos) that translate src → tgt, in order; null if Opus-MT cannot do it */
  function opusRoute(src, tgt) {
    if (!src || !tgt || src === tgt) return null;
    if (OPUS.has(`${src}-${tgt}`)) return [repo(`${src}-${tgt}`)];
    if (src !== 'en' && tgt !== 'en' && OPUS.has(`${src}-en`) && OPUS.has(`en-${tgt}`)) return [repo(`${src}-en`), repo(`en-${tgt}`)];
    return null;
  }

  /** Base language of a BCP 47 tag ('pt-BR' → 'pt'), only if it is one of LANGS */
  function baseLang(tag) {
    const b = String(tag || '').toLowerCase().split(/[-_]/)[0];
    return LANGS.includes(b) ? b : null;
  }

  const MAX_PIECE = 400;   // Opus-MT handles at most 512 tokens per input – keep pieces well below

  /** Splits one paragraph into sentences (Intl.Segmenter where available), overlong ones at commas/spaces */
  function sentences(par, lang) {
    let parts;
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      try { parts = [...new Intl.Segmenter(lang || undefined, { granularity: 'sentence' }).segment(par)].map(s => s.segment); } catch (_) {}
    }
    if (!parts) parts = par.match(/[^.!?。！？]+(?:[.!?。！？]+["'»«”’)\]]*\s*|$)/g) || [par];
    const out = [];
    for (let p of parts.map(s => s.trim()).filter(Boolean)) {
      while (p.length > MAX_PIECE) {
        let cut = p.lastIndexOf(', ', MAX_PIECE);
        if (cut < MAX_PIECE / 2) cut = p.lastIndexOf(' ', MAX_PIECE);
        if (cut < MAX_PIECE / 2) cut = MAX_PIECE;
        out.push(p.slice(0, cut + 1).trim());
        p = p.slice(cut + 1).trim();
      }
      if (p) out.push(p);
    }
    return out;
  }

  /**
   * Splits a text into pieces to translate, keeping the line structure.
   * byParagraph: whole lines (Translator API), otherwise sentences (Opus-MT).
   * Returns { lines: [[pieceIndex, …] per line], pieces: [string] } – empty lines stay empty.
   */
  function split(text, lang, byParagraph) {
    const lines = [], pieces = [];
    for (const line of String(text).replace(/\r\n?/g, '\n').split('\n')) {
      const idx = [];
      const trimmed = line.trim();
      if (trimmed) for (const p of byParagraph ? [trimmed] : sentences(trimmed, lang)) { idx.push(pieces.length); pieces.push(p); }
      lines.push(idx);
    }
    return { lines, pieces };
  }

  /** Puts translated pieces back into lines (sentences of a line joined by a space; none for CJK targets) */
  function join(parts, translated, tgt) {
    const sep = ['zh', 'ja'].includes(tgt) ? '' : ' ';
    return parts.lines.map(idx => idx.map(i => (translated[i] || '').trim()).filter(Boolean).join(sep)).join('\n').trim();
  }

  const api = { LANGS, OPUS_MODELS, OPUS_MB, opusRoute, baseLang, sentences, split, join, MAX_PIECE };
  root.TranslatorLogic = api;
})(self);
