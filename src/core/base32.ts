/** RFC 4648 base32, the encoding every authenticator uses for shared secrets. */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/**
 * Decodes base32, tolerating the mess real secrets arrive in: lowercase,
 * spaces, and `=` padding are all accepted.
 */
export function decodeBase32(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '')
  if (clean.length === 0) throw new Error('empty base32 string')

  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of clean) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error(`invalid base32 character: ${char}`)
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}
