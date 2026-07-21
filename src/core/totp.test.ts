import { describe, expect, it } from 'vitest'
import { decodeBase32, encodeBase32 } from './base32'
import { groupDigits, hotp, millisRemaining, totp } from './totp'
import type { Account } from './types'

const asciiSecret = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'ascii'))

// RFC 4226 / RFC 6238 use these seeds.
const SEED_SHA1 = asciiSecret('12345678901234567890')
const SEED_SHA256 = asciiSecret('12345678901234567890123456789012')
const SEED_SHA512 = asciiSecret(
  '1234567890123456789012345678901234567890123456789012345678901234'
)

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = Uint8Array.from([0, 1, 127, 128, 255, 42, 17])
    expect(decodeBase32(encodeBase32(bytes))).toEqual(bytes)
  })

  it('matches the well-known JBSWY3DP vector', () => {
    expect(encodeBase32(asciiSecret('Hello!'))).toBe('JBSWY3DPEE')
    expect(Buffer.from(decodeBase32('JBSWY3DP')).toString()).toBe('Hello')
  })

  it('tolerates lowercase, spaces and padding', () => {
    expect(decodeBase32('jbsw y3dp====')).toEqual(decodeBase32('JBSWY3DP'))
  })

  it('rejects characters outside the alphabet', () => {
    expect(() => decodeBase32('JBSW1!')).toThrow()
  })
})

describe('hotp — RFC 4226 test vectors', () => {
  const expected = [
    '755224', '287082', '359152', '969429', '338314',
    '254676', '287922', '162583', '399871', '520489'
  ]

  it.each(expected.map((code, counter) => ({ counter, code })))(
    'counter $counter → $code',
    ({ counter, code }) => {
      expect(hotp(SEED_SHA1, counter, 6, 'SHA1')).toBe(code)
    }
  )
})

describe('totp — RFC 6238 test vectors', () => {
  const vectors = [
    { time: 59, sha1: '94287082', sha256: '46119246', sha512: '90693936' },
    { time: 1111111109, sha1: '07081804', sha256: '68084774', sha512: '25091201' },
    { time: 1111111111, sha1: '14050471', sha256: '67062674', sha512: '99943326' },
    { time: 1234567890, sha1: '89005924', sha256: '91819424', sha512: '93441116' },
    { time: 2000000000, sha1: '69279037', sha256: '90698825', sha512: '38618901' },
    { time: 20000000000, sha1: '65353130', sha256: '77737706', sha512: '47863826' }
  ]

  it.each(vectors)('T=$time', ({ time, sha1, sha256, sha512 }) => {
    const ms = time * 1000
    expect(totp(SEED_SHA1, ms, 30, 8, 'SHA1')).toBe(sha1)
    expect(totp(SEED_SHA256, ms, 30, 8, 'SHA256')).toBe(sha256)
    expect(totp(SEED_SHA512, ms, 30, 8, 'SHA512')).toBe(sha512)
  })

  it('produces 6 digits when asked for 6', () => {
    expect(totp(SEED_SHA1, 59_000, 30, 6, 'SHA1')).toBe('287082')
  })

  it('holds the same code for the whole period, then changes', () => {
    const start = 30_000
    expect(totp(SEED_SHA1, start, 30, 6, 'SHA1')).toBe(totp(SEED_SHA1, start + 29_999, 30, 6, 'SHA1'))
    expect(totp(SEED_SHA1, start, 30, 6, 'SHA1')).not.toBe(totp(SEED_SHA1, start + 30_000, 30, 6, 'SHA1'))
  })
})

describe('millisRemaining', () => {
  const account = { type: 'totp', period: 30 } as Account

  it('counts down within the period', () => {
    expect(millisRemaining(account, 0)).toBe(30_000)
    expect(millisRemaining(account, 25_000)).toBe(5_000)
    expect(millisRemaining(account, 29_999)).toBe(1)
  })

  it('never expires for HOTP', () => {
    expect(millisRemaining({ type: 'hotp' } as Account, 123)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('groupDigits', () => {
  it('splits 6 and 8 digit codes down the middle', () => {
    expect(groupDigits('492173')).toBe('492 173')
    expect(groupDigits('94287082')).toBe('9428 7082')
  })
})
