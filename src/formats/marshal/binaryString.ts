/**
 * Byte-for-byte conversion between raw bytes and a JS string with one char
 * per byte (U+0000-U+00FF), used for symbol names and float text.
 *
 * Don't use TextDecoder('latin1') for this: per the WHATWG Encoding spec that
 * label means windows-1252, so browsers (and the app's WebView) map bytes
 * 0x80-0x9F to other code points (0x99 -> U+2122) and the bytes can't be
 * recovered. Node keeps them, which hides the problem in tests.
 */
export function bytesToBinaryString(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x2000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x2000));
  }
  return text;
}

export function binaryStringToBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}
