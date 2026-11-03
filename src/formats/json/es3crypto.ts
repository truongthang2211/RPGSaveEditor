import { pathSegments } from '../../utils/path';

/**
 * Easy Save 3's password protection: AES-128 in CBC mode with PKCS7 padding.
 * The file starts with the 16-byte IV, and the key is PBKDF2 (HMAC-SHA1, 100
 * rounds, the IV as the salt) of the password. The text it protects is the
 * save's JSON, gzip-compressed first when the game compresses its saves.
 */
const IV_SIZE = 16;
const ROUNDS = 100;

const subtle = () => globalThis.crypto.subtle;
const encoder = new TextEncoder();

/** PBKDF2 of `password`, straight into an AES-CBC key (one fewer round trip through WebCrypto than importing the raw bits separately). */
async function deriveKey(password: string, iv: Uint8Array, usages: KeyUsage[] = ['encrypt', 'decrypt']): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', encoder.encode(password) as BufferSource, 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-1', salt: iv as BufferSource, iterations: ROUNDS }, material, { name: 'AES-CBC', length: 128 }, false, usages);
}

/** Whether `bytes` could be Easy Save's encryption: an IV plus whole blocks. */
export const looksEncrypted = (bytes: Uint8Array) => bytes.length >= IV_SIZE * 2 && bytes.length % 16 === 0;

/** The decrypted bytes, or null when the password is wrong (the padding doesn't check out). */
export async function decryptEs3(bytes: Uint8Array, password: string): Promise<Uint8Array | null> {
  const iv = bytes.slice(0, IV_SIZE);
  try {
    const key = await deriveKey(password, iv, ['decrypt']);
    return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv }, key, bytes.slice(IV_SIZE)));
  } catch {
    return null;
  }
}

/**
 * Whether `password` could be the one: decrypts just the last block, whose
 * padding must be valid (a wrong password passes that about 1 time in 256).
 * Much cheaper than decrypting a whole save, for trying thousands of words.
 */
export async function passwordFits(bytes: Uint8Array, password: string): Promise<boolean> {
  const iv = bytes.slice(0, IV_SIZE);
  try {
    const key = await deriveKey(password, iv, ['decrypt']);
    await subtle().decrypt({ name: 'AES-CBC', iv: bytes.slice(-2 * IV_SIZE, -IV_SIZE) }, key, bytes.slice(-IV_SIZE));
    return true;
  } catch {
    return false;
  }
}

export async function encryptEs3(plain: Uint8Array, password: string): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_SIZE));
  const key = await deriveKey(password, iv, ['encrypt']);
  const encrypted = new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv }, key, plain as BufferSource));
  const out = new Uint8Array(IV_SIZE + encrypted.length);
  out.set(iv);
  out.set(encrypted, IV_SIZE);
  return out;
}

/** Passwords games commonly use (`password` is Easy Save's own default, `myPassword` its documentation's). */
const COMMON = [
  'password', 'myPassword', 'Password', 'mypassword', 'MyPassword', 'password123', 'Password123', 'easysave', 'EasySave', 'easysave3', 'EasySave3', 'es3', 'ES3',
  'secret', 'Secret', 'mySecret', 'key', 'encryption', 'encrypt', 'savegame', 'SaveGame', 'save', 'Save', 'unity', 'Unity', 'game', 'Game', 'admin', 'test',
  '123', '1234', '12345', '123456', '1234567', '12345678', '123456789', '0000', '1111', 'qwerty', 'abc123', 'letmein', 'hello', 'default',
];

/** Words to try from the file's own path: `.../LocalLow/<Company>/<Game>/SaveFile.es3` and the file's name. */
function fromPath(filePath: string): string[] {
  const parts = pathSegments(filePath);
  const file = (parts.pop() ?? '').replace(/\.[^.]*$/, '');
  const words = [...parts.slice(-2), file];
  return words.flatMap((word) => [word, word.toLowerCase(), word.toUpperCase(), word.replace(/\s+/g, '')]);
}

/** The passwords to try on a file, most likely first: ones that worked before, the game's names, then the usual ones. */
export const candidatePasswords = (filePath: string | undefined, remembered: string[] = []): string[] =>
  [...new Set([...remembered, ...(filePath ? fromPath(filePath) : []), ...COMMON])].filter((word) => word.length > 0);

/** Thrown for a save that is encrypted with a password the app doesn't know. */
export class PasswordRequiredError extends Error {
  constructor(readonly wrongPassword = false) {
    super(wrongPassword ? "That password doesn't open this save." : 'This save is encrypted (Unity Easy Save or similar).');
    this.name = 'PasswordRequiredError';
  }
}
