import { aesEcbKeyFits, base64ToBytes, bytesToBase64, decryptAesEcb, encryptAesEcb, looksLikeAesEcbBase64 } from './aesEcb';
import { decryptEs3, encryptEs3, looksEncrypted, passwordFits } from './es3crypto';

/** The encryption schemes a JSON save's bytes can be: Easy Save's, or the hand-rolled AES-ECB one (see aesEcb.ts). */
export type CipherKind = 'es3' | 'aesEcb';

export interface DetectedCipher {
  kind: CipherKind;
  /** Whether the file had a BOM before its content; only meaningful for a Base64-text cipher (es3 is raw binary, with no BOM of its own). */
  bom: boolean;
  /** Cheap check: whether `candidate` could be the password/key, for trying many of them. */
  fits(candidate: string): boolean | Promise<boolean>;
  /** The decrypted bytes for `candidate`, or null when it's wrong. */
  decrypt(candidate: string): Promise<Uint8Array | null> | (Uint8Array | null);
}

const decodeUtf8 = (bytes: Uint8Array): string | null => {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
};

/** Which encryption scheme `bytes` might be in, if any (checked by shape, not by trying to decrypt). */
export function detectCipher(bytes: Uint8Array): DetectedCipher | null {
  const text = decodeUtf8(bytes);
  if (text !== null) {
    const bom = text.startsWith('﻿');
    const body = (bom ? text.slice(1) : text).trim();
    if (looksLikeAesEcbBase64(body)) {
      const cipherBytes = base64ToBytes(body);
      return { kind: 'aesEcb', bom, fits: (candidate) => aesEcbKeyFits(cipherBytes, candidate), decrypt: (candidate) => decryptAesEcb(cipherBytes, candidate) };
    }
  }
  if (looksEncrypted(bytes)) {
    return { kind: 'es3', bom: false, fits: (candidate) => passwordFits(bytes, candidate), decrypt: (candidate) => decryptEs3(bytes, candidate) };
  }
  return null;
}

/** Encrypts `plain` back into a file's bytes for the given cipher kind. */
export async function encryptFor(kind: CipherKind, plain: Uint8Array, password: string, bom: boolean): Promise<Uint8Array> {
  if (kind === 'aesEcb') return new TextEncoder().encode((bom ? '﻿' : '') + bytesToBase64(encryptAesEcb(plain, password)));
  return encryptEs3(plain, password);
}
