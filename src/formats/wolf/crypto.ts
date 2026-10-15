/**
 * Wolf RPG Editor save encryption, after WolfSave by Sinflower (MIT License, see LICENSE-WolfSave.txt,
 * https://github.com/Sinflower/WolfSave).
 *
 * Bytes from 0x14 on are XORed with three streams of MSVC `rand() >> 12`,
 * seeded with bytes 0, 3 and 9 of the file (which stay in the clear) and
 * stepping 1, 2 and 5 bytes. XOR is its own inverse, so the same function
 * encrypts and decrypts. Byte 2 holds the sum of the decrypted bytes from
 * 0x14 on (mod 256).
 */

export const HEADER_SIZE = 0x14;

/** MSVC's rand(): a 32-bit LCG returning bits 16..30. */
export function msvcRand(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 214013) + 2531011) >>> 0;
    return (state >>> 16) & 0x7fff;
  };
}

/** Encrypts or decrypts (the same operation) a copy of `data`. */
export function crypt(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data);
  const seeds = [data[0], data[3], data[9]];
  const steps = [1, 2, 5];
  seeds.forEach((seed, i) => {
    const rand = msvcRand(seed);
    for (let j = HEADER_SIZE; j < out.length; j += steps[i]) out[j] ^= (rand() >> 12) & 0xff;
  });
  return out;
}

/** The checksum stored at byte 2, over decrypted data. */
export function checksum(plain: Uint8Array): number {
  let sum = 0;
  for (let i = HEADER_SIZE; i < plain.length; i++) sum = (sum + plain[i]) & 0xff;
  return sum;
}
