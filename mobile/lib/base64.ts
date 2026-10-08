// UTF-8 <-> base64, which is how react-native-ble-plx carries characteristic
// values. Written out rather than relying on btoa/atob: those handle Latin-1
// only, and a network name may contain any character.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function utf8Encode(text: string): number[] {
  const bytes: number[] = []
  for (const symbol of text) {
    const code = symbol.codePointAt(0) ?? 0
    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      )
    }
  }
  return bytes
}

function utf8Decode(bytes: number[]): string {
  let text = ''
  let i = 0
  while (i < bytes.length) {
    const first = bytes[i]
    const extra = first >= 0xf0 ? 3 : first >= 0xe0 ? 2 : first >= 0xc0 ? 1 : 0
    let code = extra === 0 ? first : first & (0x3f >> extra)
    for (let k = 1; k <= extra; k++) {
      code = (code << 6) | ((bytes[i + k] ?? 0) & 0x3f)
    }
    text += String.fromCodePoint(code)
    i += extra + 1
  }
  return text
}

// Wi-Fi limits (32-byte SSID, 63-byte passphrase) count bytes, not letters.
export function utf8ByteLength(text: string): number {
  return utf8Encode(text).length
}

export function textToBase64(text: string): string {
  const bytes = utf8Encode(text)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]]
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += ALPHABET[(triple >> 18) & 0x3f] + ALPHABET[(triple >> 12) & 0x3f]
    out += b === undefined ? '=' : ALPHABET[(triple >> 6) & 0x3f]
    out += c === undefined ? '=' : ALPHABET[triple & 0x3f]
  }
  return out
}

export function base64ToText(encoded: string): string {
  const clean = encoded.replace(/[^A-Za-z0-9+/]/g, '')
  const bytes: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const values = [0, 1, 2, 3].map((k) => ALPHABET.indexOf(clean[i + k] ?? 'A'))
    const triple = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3]
    bytes.push((triple >> 16) & 0xff)
    if (clean[i + 2] !== undefined) bytes.push((triple >> 8) & 0xff)
    if (clean[i + 3] !== undefined) bytes.push(triple & 0xff)
  }
  return utf8Decode(bytes)
}
