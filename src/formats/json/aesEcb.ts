import aesjs from 'aes-js';

/**
 * A hand-rolled save encryption found in some Unity games (not Easy Save):
 * AES-128 in ECB mode (no IV) with PKCS7 padding, whose 16-byte key is the
 * first 16 UTF-8 bytes of a key string that's hardcoded in the game's own
 * code (a class with an `Encrypt`/`Decrypt` pair and a private key constant,
 * a fairly common pattern) rather than a password the player enters, and
 * with no PBKDF2 like Easy Save's. The ciphertext is Base64 text, often
 * written out with a BOM like any other text file. Browsers' Web Crypto API
 * has no AES-ECB, so this uses the `aes-js` package instead.
 */
const BLOCK = 16;

const isBase64Char = (code: number) =>
  (code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || code === 0x2b || code === 0x2f || code === 0x3d;

/** Whether `text` (the file's text, BOM and surrounding whitespace already stripped) looks like Base64 of whole AES blocks. */
export function looksLikeAesEcbBase64(text: string): boolean {
  if (text.length < BLOCK * 2 || text.length % 4 !== 0) return false;
  for (let i = 0; i < text.length; i++) {
    if (!isBase64Char(text.charCodeAt(i))) return false;
  }
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const decodedLength = (text.length / 4) * 3 - padding;
  return decodedLength > 0 && decodedLength % BLOCK === 0;
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** The key is just the password's bytes, so it needs to be at least one block long. */
const keyFor = (password: string): Uint8Array | null => {
  const bytes = new TextEncoder().encode(password);
  return bytes.length >= BLOCK ? bytes.slice(0, BLOCK) : null;
};

function unpad(bytes: Uint8Array): Uint8Array | null {
  const count = bytes.length;
  if (count === 0) return null;
  const pad = bytes[count - 1];
  if (pad < 1 || pad > BLOCK || pad > count) return null;
  for (let i = count - pad; i < count; i++) {
    if (bytes[i] !== pad) return null;
  }
  return bytes.slice(0, count - pad);
}

function pkcs7(bytes: Uint8Array): Uint8Array {
  const padLength = BLOCK - (bytes.length % BLOCK);
  const out = new Uint8Array(bytes.length + padLength);
  out.set(bytes);
  out.fill(padLength, bytes.length);
  return out;
}

/** The decrypted bytes, or null when `password` is too short for a key, or wrong (the padding doesn't check out). */
export function decryptAesEcb(cipher: Uint8Array, password: string): Uint8Array | null {
  const key = keyFor(password);
  if (!key || cipher.length === 0 || cipher.length % BLOCK !== 0) return null;
  try {
    return unpad(new aesjs.ModeOfOperation.ecb(key).decrypt(cipher));
  } catch {
    return null;
  }
}

export function encryptAesEcb(plain: Uint8Array, password: string): Uint8Array {
  const key = keyFor(password);
  if (!key) throw new Error('This save needs a key of at least 16 characters.');
  return new aesjs.ModeOfOperation.ecb(key).encrypt(pkcs7(plain));
}

/**
 * Whether `password` could be the one: decrypts just the last block, whose
 * padding must be valid (a wrong password passes that about 1 time in 256).
 * ECB blocks don't chain, so decrypting one block alone is exact, not an
 * approximation, and much cheaper than decrypting the whole save.
 */
export function aesEcbKeyFits(cipher: Uint8Array, password: string): boolean {
  const key = keyFor(password);
  if (!key || cipher.length < BLOCK || cipher.length % BLOCK !== 0) return false;
  const lastBlock = new aesjs.ModeOfOperation.ecb(key).decrypt(cipher.slice(cipher.length - BLOCK));
  return unpad(lastBlock) !== null;
}
