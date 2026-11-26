// Podcast player – sources, parsing and transcripts (no app state, no storage, no network).
//   Podcast.parseInput(text)        → { kind: 'ard', id } | { kind: 'rss', url } | { error: 'errUrl' | 'errHttp' }
//   Podcast.ARD_API                 GraphQL endpoint of the ARD Audiothek (also behind ARD Sounds, CORS "*")
//   Podcast.ardShowUrl(id, n)       GET URL: show with its newest n episodes (id = urn:ard:show:… or a number)
//   Podcast.ardEpisodeUrl(id)       GET URL: the show of an episode (pasted episode link)
//   Podcast.ardTranscriptUrl(id)    GET URL: transcript of one episode (numeric item id)
//   Podcast.fromArd(json)           → { title, author, link, total, episodes } | throws .code 'notFound'
//   Podcast.parseRss(xml)           → same shape from an RSS podcast feed | throws .code 'notXml' | 'notFeed'
//   Podcast.ardSegments(json)       → transcript segments [{ start, end, text, speaker }] (seconds)
//   Podcast.parseTranscript(text, type) → segments from WebVTT, SRT, podcast JSON, HTML or plain text
//   Podcast.toRss(podcast, episodes) → RSS 2.0 feed with iTunes tags (like the ARD-Audiothek-RSS script)
//   Podcast.clock(seconds)          → "1:02:03" / "4:05"
// An episode: { id, title, date (ms), dur (s), audio, type, link, text (plain, ≤ 400 chars),
//   tr: null | { ard: itemId } | { url, type } }
window.Podcast = (function () {
  'use strict';

  const ARD_API = 'https://api.ardaudiothek.de/graphql';
  const ARD_HOSTS = /(^|\.)(ardaudiothek\.de|ardsounds\.de)$/;
  const err = code => { const e = new Error(code); e.code = code; return e; };

  /* ---------- What the user pasted ---------- */
  function parseInput(raw) {
    const s = String(raw || '').trim();
    // Bare URN (the PHP script accepts ?urn=… too)
    let m = /^urn:ard:(show|episode):([0-9a-f]{8,32})$/i.exec(s);
    if (m) return { kind: 'ard', id: `urn:ard:${m[1].toLowerCase()}:${m[2].toLowerCase()}` };
    let u;
    try { u = new URL(s); } catch (_) { return { error: 'errUrl' }; }
    if (!/^https?:$/.test(u.protocol)) return { error: 'errUrl' };
    if (ARD_HOSTS.test(u.hostname)) {
      const path = decodeURIComponent(u.pathname);
      m = /urn:ard:(show|episode):([0-9a-f]{8,32})/i.exec(path);
      if (m) return { kind: 'ard', id: `urn:ard:${m[1].toLowerCase()}:${m[2].toLowerCase()}` };
      // Older ARD Audiothek links: /sendung/<name>/<number>/ and /episode/<name>/<number>/
      m = /\/(sendung|episode)\/[^/]+\/(\d{5,12})\/?$/.exec(path);
      if (m) return { kind: 'ard', id: m[2], episode: m[1] === 'episode' };
      return { error: 'errArdLink' };
    }
    if (u.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) return { kind: 'rss', url: u.href, http: true };
    return { kind: 'rss', url: u.href };
  }

  /* ---------- ARD Audiothek / ARD Sounds (GraphQL, plain GET: no preflight, cacheable) ---------- */
  const gql = (query, variables) => `${ARD_API}?query=${encodeURIComponent(query.replace(/\s+/g, ' ').trim())}&variables=${encodeURIComponent(JSON.stringify(variables))}`;
  const SHOW_Q = `query($id:ID!,$n:Int){ show(id:$id){ id title synopsis sharingUrl
    publicationService{ title }
    items(first:$n){ totalCount nodes { id title publishDate duration summary sharingUrl audios{ url mimeType } transcript{ itemId } } } } }`;
  const ardShowUrl = (id, n = 300) => gql(SHOW_Q, { id: String(id), n });
  const ardEpisodeUrl = id => gql('query($id:ID!){ item(id:$id){ id showId show{ id } } }', { id: String(id) });
  const ardTranscriptUrl = id => gql('query($id:ID!){ item(id:$id){ id transcript{ data text } } }', { id: String(id) });

  function bestAudio(list) {
    const a = (list || []).filter(x => x && /^https:\/\//.test(x.url || ''));
    return a.find(x => /mp3|mpeg/.test(x.mimeType || '') || /\.mp3(\?|$)/.test(x.url)) || a[0] || null;
  }
  const short = s => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > 400 ? s.slice(0, 399) + '…' : s; };

  function fromArd(json) {
    const show = json && json.data && json.data.show;
    if (!show) throw err('notFound');
    const nodes = (show.items && show.items.nodes) || [];
    const episodes = [];
    for (const n of nodes) {
      const a = bestAudio(n.audios);
      if (!a) continue;
      const date = Date.parse(n.publishDate || '');
      episodes.push({
        id: String(n.id), title: String(n.title || '').trim(), date: Number.isFinite(date) ? date : null,
        dur: Number(n.duration) > 0 ? Math.round(n.duration) : null, audio: a.url, type: a.mimeType || 'audio/mpeg',
        link: /^https:\/\//.test(n.sharingUrl || '') ? n.sharingUrl : '', text: short(plain(n.summary)),
        tr: n.transcript ? { ard: String(n.id) } : null,
      });
    }
    return {
      title: String(show.title || '').trim(), author: String((show.publicationService && show.publicationService.title) || '').trim(),
      link: /^https:\/\//.test(show.sharingUrl || '') ? show.sharingUrl : '', text: short(plain(show.synopsis)),
      total: (show.items && show.items.totalCount) || episodes.length, episodes,
    };
  }

  /* ---------- RSS podcast feeds ---------- */
  const kids = (el, name) => el ? [...el.children].filter(c => c.localName === name) : [];
  const kid = (el, name) => kids(el, name)[0] || null;
  const txt = el => el ? el.textContent.trim() : '';
  // Show notes are HTML: only their text is kept (never inserted as markup)
  function plain(html) {
    const s = String(html || '');
    if (!/[<&]/.test(s)) return s;
    const doc = new DOMParser().parseFromString(`<body>${s.replace(/<(br|\/p|\/li|\/div)\b[^>]*>/gi, '$& ')}</body>`, 'text/html');
    for (const el of doc.body.querySelectorAll('script, style, noscript, template')) el.remove();
    return doc.body.textContent || '';
  }
  // itunes:duration: seconds, MM:SS or HH:MM:SS
  function duration(s) {
    s = String(s || '').trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return Math.round(+s) || null;
    const p = s.split(':').map(Number);
    if (p.some(x => !Number.isFinite(x))) return null;
    return Math.round(p.reduce((a, x) => a * 60 + x, 0)) || null;
  }
  // Preferred transcript formats: with times first
  const TR_TYPES = ['text/vtt', 'application/x-subrip', 'application/srt', 'application/json', 'text/html', 'text/plain'];
  function pickTranscript(it, base) {
    const list = kids(it, 'transcript').map(t => ({ url: (t.getAttribute('url') || '').trim(), type: (t.getAttribute('type') || '').trim().toLowerCase() }))
      .map(t => { try { return { ...t, url: new URL(t.url, base).href }; } catch (_) { return null; } })
      .filter(t => t && /^https?:\/\//.test(t.url));
    list.sort((a, b) => (TR_TYPES.indexOf(a.type) + 1 || 99) - (TR_TYPES.indexOf(b.type) + 1 || 99));
    return list[0] || null;
  }

  function parseRss(source, base) {
    const xml = String(source || '').replace(/^﻿/, '').trim();
    if (!xml.startsWith('<')) throw err('notXml');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw err('notXml');
    const ch = doc.documentElement.localName === 'rss' ? kid(doc.documentElement, 'channel') : null;
    if (!ch) throw err('notFeed');
    const episodes = [];
    kids(ch, 'item').forEach((it, i) => {
      const enc = kid(it, 'enclosure');
      let audio = enc ? (enc.getAttribute('url') || '').trim() : '';
      try { audio = audio ? new URL(audio, base).href : ''; } catch (_) { audio = ''; }
      if (!/^https?:\/\//.test(audio)) return;
      const title = txt(kid(it, 'title'));
      const date = Date.parse(txt(kid(it, 'pubDate')));
      const link = txt(kid(it, 'link'));
      episodes.push({
        id: (txt(kid(it, 'guid')) || audio || `${title}#${i}`).slice(0, 300), title, date: Number.isFinite(date) ? date : null,
        dur: duration(txt(kid(it, 'duration'))), audio, type: (enc.getAttribute('type') || 'audio/mpeg').trim(),
        link: /^https?:\/\//.test(link) ? link : '',
        text: short(plain(txt(kid(it, 'summary')) || txt(kid(it, 'description')) || txt(kid(it, 'encoded')))),
        tr: pickTranscript(it, base),
      });
    });
    episodes.sort((a, b) => (b.date || 0) - (a.date || 0));
    const link = txt(kids(ch, 'link').find(l => !l.namespaceURI || l.namespaceURI === ch.namespaceURI) || null);
    return {
      title: txt(kid(ch, 'title')), author: txt(kid(ch, 'author')) || txt(kid(ch, 'creator')),
      link: /^https?:\/\//.test(link) ? link : '', text: short(plain(txt(kid(ch, 'summary')) || txt(kid(ch, 'description')))),
      total: episodes.length, episodes,
    };
  }

  /* ---------- Transcripts ---------- */
  // "00:01:02.500", "01:02,5", "62.5" → seconds
  function secs(s) {
    s = String(s == null ? '' : s).trim().replace(',', '.');
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return +s;
    const p = s.split(':').map(Number);
    if (p.length < 2 || p.some(x => !Number.isFinite(x))) return null;
    return p.reduce((a, x) => a * 60 + x, 0);
  }
  // Text only: tags (<v Anna>, <b>) and entities through the HTML parser, never a regular expression on markup
  const clean = s => plain(s).replace(/\s+/g, ' ').trim();
  const seg = (start, end, text, speaker) => ({ start, end, text: clean(text), speaker: speaker ? String(speaker).slice(0, 60) : '' });

  function ardSegments(json) {
    const tr = json && json.data && json.data.item && json.data.item.transcript;
    if (!tr) return [];
    let data = tr.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (_) { data = null; } }
    if (Array.isArray(data)) {
      // ARD names speakers only by number ("unknown") – shown as "Stimme 1", "Stimme 2" … (see the page)
      return data.map(d => seg(secs(d.start), secs(d.end), d.text,
        d.speaker && d.speaker.name && d.speaker.name !== 'unknown' ? d.speaker.name : d.speaker && d.speaker.id ? `#${d.speaker.id}` : ''))
        .filter(s => s.text);
    }
    if (tr.text) return parseTranscript(tr.text, 'text/plain');
    return [];
  }

  // WebVTT and SRT: blocks separated by empty lines, a line "start --> end", then the text (<v Name> = speaker)
  function cues(text) {
    const out = [];
    for (const block of text.replace(/\r/g, '').split(/\n{2,}/)) {
      const lines = block.split('\n');
      const i = lines.findIndex(l => l.includes('-->'));
      if (i < 0) continue;
      const [a, b] = lines[i].split('-->');
      let body = lines.slice(i + 1).join(' ');
      let speaker = '';
      const v = /<v(?:\.[^ >]*)?\s+([^>]+)>/.exec(body);
      if (v) speaker = v[1].trim();
      const colon = !v && /^([A-ZÄÖÜ][\wÄÖÜäöüß .-]{0,30}):\s/.exec(clean(body));
      if (colon) { speaker = colon[1]; body = clean(body).slice(colon[0].length); }
      const s = seg(secs(a), secs((b || '').trim().split(/\s/)[0]), body, speaker);
      if (s.text) out.push(s);
    }
    // Merge consecutive short cues of the same speaker into readable paragraphs (≈ 20 s)
    const merged = [];
    for (const c of out) {
      const last = merged[merged.length - 1];
      if (last && last.speaker === c.speaker && c.start != null && last.start != null && c.start - last.start < 20 && last.text.length < 400) {
        last.text += ' ' + c.text; last.end = c.end;
      } else merged.push({ ...c });
    }
    return merged;
  }

  function parseTranscript(text, type) {
    text = String(text || '').replace(/^﻿/, '');
    type = String(type || '').toLowerCase();
    const head = text.trimStart().slice(0, 20);
    if (/json/.test(type) || /^[{[]/.test(head)) {
      try {
        const j = JSON.parse(text);
        const list = Array.isArray(j) ? j : j.segments || [];
        return list.map(x => seg(secs(x.startTime != null ? x.startTime : x.start), secs(x.endTime != null ? x.endTime : x.end), x.body || x.text, x.speaker))
          .filter(s => s.text);
      } catch (_) { if (/json/.test(type)) return []; }
    }
    if (/vtt|srt|subrip/.test(type) || /^WEBVTT/.test(head) || text.slice(0, 400).includes('-->')) return cues(text);
    if (/html/.test(type) || /^</.test(head)) {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const paras = [...doc.body.querySelectorAll('p, li, h1, h2, h3, h4, div:not(:has(p, div, li))')].map(p => p.textContent);
      return (paras.length ? paras : [doc.body.textContent]).map(p => seg(null, null, p, '')).filter(s => s.text);
    }
    return text.split(/\n\s*\n/).map(p => seg(null, null, p, '')).filter(s => s.text);
  }

  /* ---------- RSS export: a regular podcast feed of a show (what the ARD-Audiothek-RSS script makes) ---------- */
  const x = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  function toRss(p, episodes) {
    const items = episodes.map(e => `  <item>
    <title>${x(e.title)}</title>
    <guid isPermaLink="false">${x(e.id)}</guid>${e.link ? `\n    <link>${x(e.link)}</link>` : ''}${e.date ? `\n    <pubDate>${new Date(e.date).toUTCString()}</pubDate>` : ''}
    <description>${x(e.text)}</description>
    <enclosure url="${x(e.audio)}" type="${x(e.type || 'audio/mpeg')}" length="0"/>${e.dur ? `\n    <itunes:duration>${e.dur}</itunes:duration>` : ''}
  </item>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
  <title>${x(p.title)}</title>${p.link ? `\n  <link>${x(p.link)}</link>` : ''}
  <description>${x(p.text || p.title)}</description>${p.author ? `\n  <itunes:author>${x(p.author)}</itunes:author>` : ''}
  <generator>phanlipo.github.io/podcast-player</generator>
${items}
</channel>
</rss>
`;
  }

  function clock(s) {
    s = Math.max(0, Math.floor(Number(s) || 0));
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  return { ARD_API, parseInput, ardShowUrl, ardEpisodeUrl, ardTranscriptUrl, fromArd, parseRss, ardSegments, parseTranscript, toRss, clock, duration, secs };
})();
