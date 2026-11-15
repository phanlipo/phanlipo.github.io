// RSS reader – feed parsing and safe rendering (no app state, no storage).
//   RssFeed.parse(xmlText)        → { kind, title, link, self, items: [{ id, title, link, date, categories, author, html }] }
//                                   throws Error with .code 'notXml' | 'notFeed'
//   RssFeed.render(html)          → DocumentFragment with only harmless elements (allow-list, links http/https/mailto)
//   RssFeed.text(html, max)       → plain text (search, agent summaries)
// Supports RSS 2.0 / 0.9x, Atom 1.0 and RSS 1.0 (RDF). Namespaces are ignored (localName), so
// prefixed elements (a10:updated, dc:date, content:encoded) are found as well.
window.RssFeed = (function () {
  'use strict';

  const kids = (el, name) => el ? [...el.children].filter(c => c.localName === name) : [];
  const kid = (el, name) => kids(el, name)[0] || null;
  const txt = el => el ? el.textContent.trim() : '';
  // RFC 822 (RSS) and ISO 8601 (Atom, dc:date); "Z" after a space (Microsoft) and "GMT" are fine for Date
  function parseDate(s) {
    if (!s) return null;
    let ms = Date.parse(s);
    if (!Number.isFinite(ms)) ms = Date.parse(s.replace(/\s+Z$/, ' GMT'));
    return Number.isFinite(ms) ? ms : null;
  }
  function err(code) { const e = new Error(code); e.code = code; return e; }

  function atomLink(el, rel) {
    const links = kids(el, 'link');
    const l = links.find(x => (x.getAttribute('rel') || 'alternate') === rel);
    return l ? (l.getAttribute('href') || '').trim() : '';
  }
  // Atom text constructs: type="html" holds escaped markup, type="xhtml" a <div> with markup, else plain text
  function atomText(el) {
    if (!el) return '';
    const type = el.getAttribute('type') || 'text';
    if (type === 'xhtml') { const d = kid(el, 'div'); return d ? d.innerHTML : el.innerHTML; }
    if (type === 'html' || /html/.test(type)) return el.textContent;
    return escapeHtml(el.textContent);
  }
  const escapeHtml = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function parse(source) {
    const xml = String(source || '').replace(/^﻿/, '').trim();
    if (!xml.startsWith('<')) throw err('notXml');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw err('notXml');
    const root = doc.documentElement;
    const name = root.localName.toLowerCase();
    if (name === 'feed') return parseAtom(root);
    if (name === 'rss') {
      const ch = kid(root, 'channel');
      if (!ch) throw err('notFeed');
      return parseRss(ch, kids(ch, 'item'), 'rss');
    }
    if (name === 'rdf') {
      const ch = kid(root, 'channel');
      return parseRss(ch || root, kids(root, 'item'), 'rdf');
    }
    throw err('notFeed');
  }

  function parseRss(ch, itemEls, kind) {
    const items = itemEls.map((it, i) => {
      const link = txt(kid(it, 'link')) || (txt(kid(it, 'guid')) && /^https?:/.test(txt(kid(it, 'guid'))) ? txt(kid(it, 'guid')) : '');
      const html = txt(kid(it, 'encoded')) || txt(kid(it, 'description'));
      const date = parseDate(txt(kid(it, 'pubDate')) || txt(kid(it, 'date')) || txt(kid(it, 'updated')));
      return {
        id: txt(kid(it, 'guid')) || it.getAttribute('rdf:about') || link || `${txt(kid(it, 'title'))}#${i}`,
        title: txt(kid(it, 'title')),
        link,
        date,
        categories: kids(it, 'category').map(txt).filter(Boolean),
        author: txt(kid(it, 'author')) || txt(kid(it, 'creator')),
        html,
      };
    });
    const self = kids(ch, 'link').find(l => l.getAttribute('rel') === 'self');
    return {
      kind,
      title: txt(kids(ch, 'title')[0]),
      link: (kids(ch, 'link').find(l => !l.getAttribute('rel')) || {}).textContent?.trim() || '',
      self: self ? (self.getAttribute('href') || '').trim() : '',
      items,
    };
  }

  function parseAtom(feed) {
    const items = kids(feed, 'entry').map((e, i) => {
      const link = atomLink(e, 'alternate') || (kids(e, 'link')[0]?.getAttribute('href') || '').trim();
      return {
        id: txt(kid(e, 'id')) || link || `${txt(kid(e, 'title'))}#${i}`,
        title: kid(e, 'title') ? RssFeedText(atomText(kid(e, 'title'))) : '',
        link,
        date: parseDate(txt(kid(e, 'published')) || txt(kid(e, 'updated'))),
        categories: kids(e, 'category').map(c => (c.getAttribute('label') || c.getAttribute('term') || '').trim()).filter(Boolean),
        author: txt(kid(kid(e, 'author'), 'name')),
        html: atomText(kid(e, 'content')) || atomText(kid(e, 'summary')),
      };
    });
    return {
      kind: 'atom',
      title: kid(feed, 'title') ? RssFeedText(atomText(kid(feed, 'title'))) : '',
      link: atomLink(feed, 'alternate'),
      self: atomLink(feed, 'self'),
      items,
    };
  }

  /* ---------- Rendering: rebuild the content from an allow-list, never insert foreign markup ---------- */
  const BLOCK = new Set(['p', 'div', 'section', 'article', 'blockquote', 'pre', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'figure', 'figcaption']);
  const INLINE = new Set(['b', 'strong', 'i', 'em', 'u', 'code', 'kbd', 'sub', 'sup', 'small', 'mark', 's', 'del', 'ins', 'span', 'abbr', 'time', 'q', 'cite']);
  // Elements renamed by inert() carry an "x-" prefix
  const DROP = new Set(['x-script', 'x-style', 'x-iframe', 'x-object', 'noscript', 'template', 'form', 'button',
    'select', 'textarea', 'x-svg', 'x-math', 'x-video', 'x-audio', 'meta', 'head', 'title', 'x-frame', 'frameset']);
  const VOID = new Set(['x-img', 'x-image', 'x-source', 'x-track', 'x-input', 'x-link', 'x-embed']);
  // Headings inside an entry are shown one level below the entry title
  const MAP = { h1: 'h4', h2: 'h4', h3: 'h5', h4: 'h5', h5: 'h6', h6: 'h6', section: 'div', article: 'div', figure: 'div', figcaption: 'p', span: null };

  function safeHref(href, base) {
    try {
      const u = new URL(href, base || undefined);
      return /^(https?|mailto):$/.test(u.protocol) ? u.href : null;
    } catch (_) { return null; }
  }

  function copy(node, out, base, depth) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out.append(n.data); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.localName;
      if (DROP.has(tag)) continue;
      if (depth > 30) { out.append(n.textContent); continue; }
      if (tag === 'br') { out.append(document.createElement('br')); continue; }
      if (tag === 'hr') { out.append(document.createElement('hr')); continue; }
      if (VOID.has(tag)) {
        // Images from other servers are not loaded (privacy, CSP) – the alt text stays. Renamed void elements
        // are no longer void for the parser, so what follows them ended up inside: keep it.
        const alt = tag === 'x-img' ? (n.getAttribute('alt') || '').trim() : '';
        if (alt) out.append(`[${alt}] `);
        copy(n, out, base, depth + 1);
        continue;
      }
      if (tag === 'a') {
        const href = safeHref(n.getAttribute('href') || '', base);
        if (!href) { copy(n, out, base, depth + 1); continue; }
        const a = document.createElement('a');
        a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.referrerPolicy = 'no-referrer';
        copy(n, a, base, depth + 1);
        out.append(a);
        continue;
      }
      const mapped = tag in MAP ? MAP[tag] : tag;
      if (mapped && (BLOCK.has(tag) || INLINE.has(tag))) {
        const el = document.createElement(mapped);
        if ((tag === 'td' || tag === 'th') && n.getAttribute('colspan')) el.colSpan = Math.min(20, parseInt(n.getAttribute('colspan'), 10) || 1);
        copy(n, el, base, depth + 1);
        out.append(el);
      } else {
        copy(n, out, base, depth + 1);   // unknown or span: keep the content, drop the element
      }
    }
  }

  // DOMParser documents are inert (no scripts run, nothing is loaded), but Chromium still fires "error" on
  // images there – the inline handler would only be blocked by the CSP (console error). So event handler
  // attributes are removed and elements that load something are renamed before parsing.
  const LOADS = 'img|image|picture|source|track|video|audio|iframe|frame|object|embed|link|input|body|script|style|svg|math';
  function inert(html) {
    return String(html || '')
      .replace(new RegExp(`<(\\/?)\\s*(${LOADS})(?=[\\s/>])`, 'gi'), (m, slash, tag) => `<${slash}x-${tag.toLowerCase()}`)
      // only inside tags, so text like "online = yes" stays as it is
      .replace(/<[a-z][^>]*>/gi, tag => tag.replace(/([\s/"'])on[a-z]+\s*=/gi, '$1data-x='));
  }
  const parseHtml = html => new DOMParser().parseFromString(inert(html), 'text/html');

  function render(html, base) {
    const frag = document.createDocumentFragment();
    const doc = parseHtml(html);
    const tables = document.createDocumentFragment();
    copy(doc.body, tables, base, 0);
    // Wide tables scroll inside their own box
    for (const t of tables.querySelectorAll('table')) {
      const wrap = document.createElement('div'); wrap.className = 'table-wrap';
      t.replaceWith(wrap); wrap.append(t);
    }
    frag.append(tables);
    return frag;
  }

  // Same content as render() shows (alt texts included), as one line of text
  function RssFeedText(html, max) {
    const box = document.createElement('div');   // never attached to the page
    box.append(render(html));
    for (const el of box.querySelectorAll('br,p,div,li,h4,h5,h6,tr,td,th,dt,dd,blockquote,pre')) el.after(' ');
    const s = box.textContent.replace(/\s+/g, ' ').trim();
    return max && s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
  }

  return { parse, render, text: RssFeedText, parseDate };
})();
