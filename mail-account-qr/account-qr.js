/* Mail-Konto per QR – the QR code format of Thunderbird's "Export for Mobile", without DOM: window.AccountQr.

   Format (version 1), as written by Thunderbird desktop (comm-central mail/modules/QRExport.sys.mjs) and read by
   Thunderbird for Android (feature/migration/qrcode, QrCodePayloadAdapter/-Validator). One QR code holds a JSON array:

     [ 1,                                   format version
       [part, total],                       1-based number of this code and the number of codes
       incoming, outgoingGroups,            account 1
       incoming, outgoingGroups, … ]        more accounts (Thunderbird puts at most 3 into one code)

     incoming       = [protocol, hostname, port, security, auth, username, accountName?, password?]
     outgoingGroups = [ [ [0, hostname, port, security, auth, username, password?], [email, displayName], … ], … ]
                       every group: one SMTP server and the identities (sender addresses) that use it

     protocol  incoming 0 = IMAP, 1 = POP3; outgoing 0 = SMTP
     security  0 = none, 2 = STARTTLS, 3 = SSL/TLS   (1 is not written by Thunderbird; read as "STARTTLS if possible")
     auth      0 = none, 1 = password (normal), 2 = password (encrypted), 3 = GSSAPI, 4 = NTLM,
               5 = TLS certificate, 6 = OAuth2      (3 and 4 are not supported by the Android app)
     An empty accountName means: the account is named like the first email address. An empty password: ask for it.
     Readers skip extra array entries (forward compatibility); strings must not contain line breaks.

   Account object of this app (stored without passwords):
     { id, email, name, accountName, inProto, inHost, inPort, inSec, inAuth, inUser,
       outHost, outPort, outSec, outAuth, sameLogin, outUser, extraIds: [[email, name], …] }

   API
     AccountQr.payloads(accounts, passwords)  → [JSON string per code]   passwords: id → { in, out }
     AccountQr.parse(text)                    → { part, total, accounts: [scanned account] }
                                                throws Error('notThunderbird' | 'version' | 'invalid')
       scanned account = { accountName, incoming: { protocol, host, port, security, auth, username, password },
                           outgoing: [{ host, port, security, auth, username, password, identities: [{ email, name }] }] }
     AccountQr.fromScanned(scanned)           → { account, passwords: { in, out } }
     AccountQr.provider(email)                → { in: [host, port, sec, auth], out: [...] } | null
     AccountQr.defaultPort(kind, sec)         kind 'imap' | 'pop3' | 'smtp'
     AccountQr.checkAccount(a)                → null | error code ('email', 'inHost', 'inPort', 'outHost', 'outPort', 'lineBreak')
     AccountQr.fixUtf8(text)                  UTF-8 read as Latin-1 by a decoder ("MÃ¼ller") → "Müller"
     AccountQr.PER_CODE, SEC, AUTH, SEC_SUPPORTED, AUTH_SUPPORTED
*/
(function () {
  'use strict';
  const PER_CODE = 3;
  const SEC = [0, 1, 2, 3], AUTH = [0, 1, 2, 3, 4, 5, 6];
  const SEC_SUPPORTED = [3, 2, 0];            // order of the choices in the form
  const AUTH_SUPPORTED = [1, 2, 6, 5, 0];

  // Server settings of well-known providers [host, port, security, auth] – no guarantee, the help says so
  const PROVIDERS = [
    { d: ['gmail.com', 'googlemail.com'], in: ['imap.gmail.com', 993, 3, 6], out: ['smtp.gmail.com', 465, 3, 6] },
    { d: ['outlook.com', 'outlook.de', 'hotmail.com', 'hotmail.de', 'live.com', 'live.de', 'msn.com'],
      in: ['outlook.office365.com', 993, 3, 6], out: ['smtp.office365.com', 587, 2, 6] },
    { d: ['gmx.de', 'gmx.net', 'gmx.at', 'gmx.ch'], in: ['imap.gmx.net', 993, 3, 1], out: ['mail.gmx.net', 587, 2, 1] },
    { d: ['web.de'], in: ['imap.web.de', 993, 3, 1], out: ['smtp.web.de', 587, 2, 1] },
    { d: ['t-online.de'], in: ['secureimap.t-online.de', 993, 3, 1], out: ['securesmtp.t-online.de', 465, 3, 1] },
    { d: ['posteo.de', 'posteo.net'], in: ['posteo.de', 993, 3, 1], out: ['posteo.de', 587, 2, 1] },
    { d: ['mailbox.org'], in: ['imap.mailbox.org', 993, 3, 1], out: ['smtp.mailbox.org', 465, 3, 1] },
  ];
  function provider(email) {
    const m = String(email || '').trim().toLowerCase().match(/@([^@\s]+)$/);
    if (!m) return null;
    const p = PROVIDERS.find(x => x.d.includes(m[1]));
    return p ? { in: p.in.slice(), out: p.out.slice() } : null;
  }
  function defaultPort(kind, sec) {
    if (kind === 'smtp') return sec === 3 ? 465 : sec === 0 ? 25 : 587;
    if (kind === 'pop3') return sec === 3 ? 995 : 110;
    return sec === 3 ? 993 : 143;
  }

  const LINE = /[\r\n]/;
  const str = v => v == null ? '' : String(v);
  const EMAIL = /^[\x21-\x3f\x41-\x7e]+@[A-Za-z0-9.-]+\.[A-Za-z0-9-]{2,}$/;   // ASCII only, like Thunderbird's export
  const HOST = /^[A-Za-z0-9.:[\]-]+$/;
  const isPort = p => Number.isInteger(p) && p >= 1 && p <= 65535;

  function checkAccount(a) {
    if (!EMAIL.test(str(a.email))) return 'email';
    for (const id of a.extraIds || []) if (!EMAIL.test(str(id[0]))) return 'email';
    if (!HOST.test(str(a.inHost))) return 'inHost';
    if (!isPort(a.inPort)) return 'inPort';
    if (!HOST.test(str(a.outHost))) return 'outHost';
    if (!isPort(a.outPort)) return 'outPort';
    const texts = [a.name, a.accountName, a.inUser, a.outUser, ...(a.extraIds || []).flat()];
    if (texts.some(v => LINE.test(str(v)))) return 'lineBreak';
    return null;
  }

  function accountData(a, pw) {
    pw = pw || {};
    const inPw = str(pw.in), outPw = a.sameLogin ? inPw : str(pw.out);
    const outUser = a.sameLogin ? str(a.inUser) : str(a.outUser);
    return [
      [a.inProto === 1 ? 1 : 0, str(a.inHost).trim(), a.inPort, a.inSec, a.inAuth, str(a.inUser), str(a.accountName).trim(), inPw],
      [[[0, str(a.outHost).trim(), a.outPort, a.outSec, a.outAuth, outUser, outPw],
        [str(a.email).trim(), str(a.name)], ...(a.extraIds || []).map(i => [str(i[0]), str(i[1])])]],
    ];
  }
  function payloads(accounts, passwords) {
    const data = accounts.map(a => accountData(a, passwords && passwords[a.id]));
    const total = Math.ceil(data.length / PER_CODE), out = [];
    for (let i = 0; i < total; i++)
      out.push(JSON.stringify([1, [i + 1, total], ...data.slice(i * PER_CODE, (i + 1) * PER_CODE).flat()]));
    return out;
  }

  /* ---------- Reading ---------- */
  const fail = code => { throw new Error(code); };
  const need = ok => { if (!ok) fail('invalid'); };
  const isInt = v => Number.isInteger(v);
  const isStr = v => typeof v === 'string' && !LINE.test(v);
  const optStr = v => v === undefined || v === null || isStr(v);
  function server(arr, incoming) {
    need(Array.isArray(arr) && arr.length >= 6);
    const [protocol, host, port, security, auth, username] = arr;
    need(isInt(protocol) && (incoming ? protocol === 0 || protocol === 1 : protocol === 0));
    need(isStr(host) && host.trim() !== '' && isInt(port) && isPort(port));
    need(isInt(security) && SEC.includes(security) && isInt(auth) && AUTH.includes(auth) && isStr(username));
    const s = { protocol, host: host.trim(), port, security, auth, username };
    if (incoming) {
      need(optStr(arr[6]) && optStr(arr[7]));
      s.accountName = arr[6] || ''; s.password = arr[7] || '';
    } else {
      need(optStr(arr[6]));
      s.password = arr[6] || '';
    }
    return s;
  }
  function parse(text) {
    let d;
    try { d = JSON.parse(String(text).trim()); } catch (_) { fail('notThunderbird'); }
    if (!Array.isArray(d) || !isInt(d[0]) || !Array.isArray(d[1])) fail('notThunderbird');
    if (d[0] !== 1) fail('version');
    const [part, total] = d[1];
    need(isInt(part) && isInt(total) && part >= 1 && part <= total && total <= 100);
    const rest = d.slice(2);
    need(rest.length >= 2 && rest.length % 2 === 0);
    const accounts = [];
    for (let i = 0; i < rest.length; i += 2) {
      const incoming = server(rest[i], true), groups = rest[i + 1];
      need(Array.isArray(groups) && groups.length >= 1);
      const outgoing = groups.map(g => {
        need(Array.isArray(g) && g.length >= 2);
        const s = server(g[0], false);
        s.identities = g.slice(1).map(id => {
          need(Array.isArray(id) && id.length >= 2 && isStr(id[0]) && /^[^@\s]+@[^@\s]+$/.test(id[0]) && isStr(id[1]));
          return { email: id[0], name: id[1] };
        });
        delete s.protocol;
        return s;
      });
      const accountName = incoming.accountName; delete incoming.accountName;
      accounts.push({ accountName, incoming, outgoing });
    }
    return { part, total, accounts };
  }

  /** A scanned account as account of this app: first outgoing server with all its identities */
  function fromScanned(s) {
    const o = s.outgoing[0], [first, ...more] = o.identities;
    const sameLogin = o.username === s.incoming.username && o.password === s.incoming.password;
    return {
      account: {
        email: first.email, name: first.name, accountName: s.accountName || '',
        inProto: s.incoming.protocol, inHost: s.incoming.host, inPort: s.incoming.port,
        inSec: s.incoming.security, inAuth: s.incoming.auth, inUser: s.incoming.username,
        outHost: o.host, outPort: o.port, outSec: o.security, outAuth: o.auth,
        sameLogin, outUser: sameLogin ? '' : o.username, extraIds: more.map(i => [i.email, i.name]),
      },
      passwords: { in: s.incoming.password || '', out: sameLogin ? '' : o.password || '' },
    };
  }

  /** zxing and some phones read the bytes of a QR code as Latin-1 – Thunderbird writes UTF-8 */
  function fixUtf8(text) {
    const s = String(text);
    if (!/[\u0080-ÿ]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s;
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(s, c => c.charCodeAt(0)));
    } catch (_) { return s; }
  }

  window.AccountQr = { PER_CODE, SEC, AUTH, SEC_SUPPORTED, AUTH_SUPPORTED, payloads, parse, fromScanned, provider, defaultPort, checkAccount, fixUtf8 };
})();
