/**
 * Self-contained SHA-256 + HMAC + PBKDF2 (no native crypto dependency).
 *
 * Membership secrets must be verifiable by simply reading Firestore documents,
 * so we cannot rely on Firebase Identity Toolkit. This module gives the app the
 * same primitive (password-based key derivation) on web and React Native with
 * identical output, which is what makes the "cloud only" membership possible.
 *
 * NOTE: this is app-level credential protection, not a hardened KMS. The
 * iteration counts are deliberately modest so Hermes stays responsive.
 */

const isPrime = (x: number) => {
  if (x < 2) return false;
  for (let i = 2; i * i <= x; i++) if (x % i === 0) return false;
  return true;
};

/** First 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const K: number[] = (() => {
  const k: number[] = [];
  let n = 2;
  while (k.length < 64) {
    if (isPrime(n)) {
      const cbrt = Math.pow(n, 1 / 3);
      k.push(Math.floor((cbrt - Math.floor(cbrt)) * 0x100000000) | 0);
    }
    n++;
  }
  return k;
})();

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** @param data raw bytes @returns 32-byte digest */
export function sha256(data: Uint8Array): Uint8Array {
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
    0x5be0cd19,
  ];
  const len = data.length;
  const bitLen = len * 8;
  const withOne = len + 1;
  const padded = new Uint8Array(Math.ceil((withOne + 8) / 64) * 64);
  padded.set(data);
  padded[len] = 0x80;
  const dv = new DataView(padded.buffer);
  // 64-bit big-endian length (high word assumed 0 for our sizes)
  dv.setUint32(padded.length - 4, bitLen >>> 0, false);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);

  const w = new Int32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i], false);
  return out;
}

const BLOCK = 64;

function hmacSha256(key: Uint8Array, msg: Uint8Array): Uint8Array {
  let k = key;
  if (k.length > BLOCK) k = sha256(k);
  const pad = (fill: number) => {
    const p = new Uint8Array(BLOCK);
    p.fill(fill);
    for (let i = 0; i < k.length; i++) p[i] = k[i] ^ fill;
    return p;
  };
  const ip = pad(0x36);
  const op = pad(0x5c);
  const inner = new Uint8Array(BLOCK + msg.length);
  inner.set(ip);
  inner.set(msg, BLOCK);
  const innerHash = sha256(inner);
  const outer = new Uint8Array(BLOCK + 32);
  outer.set(op);
  outer.set(innerHash, BLOCK);
  return sha256(outer);
}

/** PBKDF2-HMAC-SHA256, one block (dkLen = 32). */
export function pbkdf2(password: Uint8Array, salt: Uint8Array, iterations: number): Uint8Array {
  const salted = new Uint8Array(salt.length + 4);
  salted.set(salt);
  new DataView(salted.buffer).setUint32(salt.length, 1, false); // INT(1) big-endian
  let u = hmacSha256(password, salted);
  const acc = new Uint8Array(32);
  acc.set(u);
  for (let i = 1; i < iterations; i++) {
    u = hmacSha256(password, u);
    for (let j = 0; j < 32; j++) acc[j] ^= u[j];
  }
  return acc;
}

/* ------------------------------------------------------------------ utils */

export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function utf8(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
  // Manual UTF-8 (Hermes ships TextEncoder, but keep this bullet-proof)
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const c2 = text.charCodeAt(++i);
      const cp = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    } else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(bytes);
}

export function randomHex(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  const c = typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;
  if (c?.getRandomValues) c.getRandomValues(buf);
  else for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  return toHex(buf);
}

/** Timing-safe-ish string compare. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* -------------------------------------------------------------- passwords */

export interface PasswordBundle {
  verifier: string;
  salt: string;
  /** Kept in the record so any device can recompute the same verifier. */
  iterations: number;
  algo: 'pbkdf2-sha256';
}

const ITERATIONS = 1200;

export function hashPassword(password: string): PasswordBundle {
  const salt = randomHex(16);
  const dk = pbkdf2(utf8(password), fromHex(salt), ITERATIONS);
  return { verifier: toHex(dk), salt, iterations: ITERATIONS, algo: 'pbkdf2-sha256' };
}

export function verifyPassword(password: string, record?: { verifier?: string; salt?: string; iterations?: number }): boolean {
  if (!record?.verifier || !record?.salt) return false;
  const iters = Number(record.iterations) > 0 ? Number(record.iterations) : ITERATIONS;
  const dk = pbkdf2(utf8(password), fromHex(record.salt), Math.min(iters, 200000));
  return safeEqual(toHex(dk), record.verifier);
}
