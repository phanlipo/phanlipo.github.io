/* One-time codes (TOTP, RFC 6238) from KeePass entries – no DOM.
   Understood fields:
     otp                     otpauth://totp/…?secret=BASE32&period=30&digits=6&algorithm=SHA1 (KeePassXC, KeePassDX)
     TimeOtp-Secret-Base32 / -Hex / -Base64 / TimeOtp-Secret, TimeOtp-Length, TimeOtp-Period, TimeOtp-Algorithm (KeePass 2.47+)
     TOTP Seed + TOTP Settings ("30;6")  (older KeePassXC / KeeTrayTOTP)
   Steam codes and HOTP are not supported (fromEntry returns null).
   TOTP.fromEntry(entry) → { secret: Uint8Array, digits, period, hash } | null
   TOTP.code(spec, nowMs) → Promise<string>;  TOTP.secondsLeft(spec, nowMs) → number */
(function (root) {
  'use strict';
  const FIELDS = ['otp', 'TOTP Seed', 'TOTP Settings'];
  const HASH = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' };

  function base32(s) {
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = String(s).toUpperCase().replace(/[\s=-]/g, '');
    if (!clean || /[^A-Z2-7]/.test(clean)) return null;
    const out = []; let bits = 0, val = 0;
    for (const c of clean) { val = (val << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { bits -= 8; out.push((val >>> bits) & 255); } }
    return new Uint8Array(out);
  }
  const fromHex = s => { const c = String(s).replace(/\s/g, ''); return /^([0-9a-f]{2})+$/i.test(c) ? new Uint8Array(c.match(/../g).map(x => parseInt(x, 16))) : null; };
  const fromB64 = s => { try { return Uint8Array.from(atob(String(s).replace(/\s/g, '')), c => c.charCodeAt(0)); } catch (_) { return null; } };
  const spec = (secret, digits, period, hash) => {
    digits = Number(digits) || 6; period = Number(period) || 30; hash = HASH[String(hash || 'SHA1').toUpperCase().replace(/^HMAC-|-/g, '')];
    if (!secret || !secret.length || !hash || !(digits >= 6 && digits <= 10) || !(period >= 1 && period <= 3600)) return null;
    return { secret, digits, period, hash };
  };
  function fromUri(uri) {
    let u; try { u = new URL(uri.trim()); } catch (_) { return null; }
    if (u.protocol !== 'otpauth:' || !/^\/?\/?totp\b/i.test(u.host + u.pathname) || u.searchParams.get('encoder')) return null;
    const p = u.searchParams;
    return spec(base32(p.get('secret') || ''), p.get('digits'), p.get('period'), p.get('algorithm'));
  }
  function fromEntry(e) {
    const f = Object.fromEntries((e.fields || []).map(x => [x.key, x.value]));
    if (f.otp) return fromUri(f.otp);
    const kp = f['TimeOtp-Secret-Base32'] != null ? base32(f['TimeOtp-Secret-Base32'])
      : f['TimeOtp-Secret-Hex'] != null ? fromHex(f['TimeOtp-Secret-Hex'])
      : f['TimeOtp-Secret-Base64'] != null ? fromB64(f['TimeOtp-Secret-Base64'])
      : f['TimeOtp-Secret'] != null ? new TextEncoder().encode(f['TimeOtp-Secret']) : null;
    if (kp) return spec(kp, f['TimeOtp-Length'], f['TimeOtp-Period'], f['TimeOtp-Algorithm']);
    if (f['TOTP Seed']) {
      if (/^otpauth:/i.test(f['TOTP Seed'].trim())) return fromUri(f['TOTP Seed']);
      const [period, digits] = String(f['TOTP Settings'] || '30;6').split(';');
      if (digits && !/^\d+$/.test(digits.trim())) return null; // "S" = Steam
      return spec(base32(f['TOTP Seed']), digits, period, 'SHA1');
    }
    return null;
  }
  async function code(s, now = Date.now()) {
    const counter = Math.floor(now / 1000 / s.period);
    const msg = new Uint8Array(8); new DataView(msg.buffer).setBigUint64(0, BigInt(counter));
    const key = await crypto.subtle.importKey('raw', s.secret, { name: 'HMAC', hash: s.hash }, false, ['sign']);
    const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
    const o = h[h.length - 1] & 15;
    const bin = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
    return String(bin % 10 ** Math.min(s.digits, 9)).padStart(s.digits, '0');
  }
  const secondsLeft = (s, now = Date.now()) => s.period - Math.floor(now / 1000) % s.period;
  root.TOTP = { FIELDS, fromEntry, code, secondsLeft, _test: { base32, fromUri } };
})(typeof self !== 'undefined' ? self : this);
