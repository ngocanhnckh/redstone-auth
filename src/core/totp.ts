import { createHmac } from 'node:crypto'
import { decodeBase32 } from './base32'
import type { Account, OtpAlgorithm } from './types'

const HMAC_NAME: Record<OtpAlgorithm, string> = {
  SHA1: 'sha1',
  SHA256: 'sha256',
  SHA512: 'sha512'
}

/** RFC 4226 HOTP: HMAC the counter, then truncate to `digits` decimal digits. */
export function hotp(
  secret: Uint8Array,
  counter: number,
  digits: 6 | 8,
  algorithm: OtpAlgorithm
): string {
  const message = Buffer.alloc(8)
  // Counter is a 64-bit big-endian integer. BigInt keeps it exact past 2^53.
  message.writeBigUInt64BE(BigInt(counter))

  const digest = createHmac(HMAC_NAME[algorithm], Buffer.from(secret)).update(message).digest()

  // Dynamic truncation: the low nibble of the last byte picks the 4-byte window.
  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3]

  return (binary % 10 ** digits).toString().padStart(digits, '0')
}

/** RFC 6238 TOTP — HOTP with the counter derived from the clock. */
export function totp(
  secret: Uint8Array,
  atMs: number,
  period: number,
  digits: 6 | 8,
  algorithm: OtpAlgorithm
): string {
  return hotp(secret, Math.floor(atMs / 1000 / period), digits, algorithm)
}

/** Generates the code for an account at a given instant. */
export function codeFor(account: Account, atMs: number): string {
  const secret = decodeBase32(account.secret)
  return account.type === 'hotp'
    ? hotp(secret, account.counter, account.digits, account.algorithm)
    : totp(secret, atMs, account.period, account.digits, account.algorithm)
}

/** Milliseconds until the account's current code expires. */
export function millisRemaining(account: Account, atMs: number): number {
  if (account.type === 'hotp') return Number.POSITIVE_INFINITY
  const periodMs = account.period * 1000
  return periodMs - (atMs % periodMs)
}

/** Splits a code into readable halves: "492173" → "492 173". */
export function groupDigits(code: string): string {
  const half = Math.ceil(code.length / 2)
  return `${code.slice(0, half)} ${code.slice(half)}`
}
