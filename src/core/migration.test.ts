import { describe, expect, it } from 'vitest'
import { decodeMigrationUri, isMigrationUri } from './migration'
import { parseOtpauth } from './otpauth'
import { AppError } from './types'

/**
 * The canonical Google Authenticator export sample: one TOTP account,
 * secret bytes "Hello!\xde\xad\xbe\xef" (base32 JBSWY3DPEHPK3PXP),
 * label "Example:alice@google.com", issuer "Example".
 */
const SAMPLE_URI =
  'otpauth-migration://offline?data=CjEKCkhlbGxvId6tvu8SGEV4YW1wbGU6YWxpY2VAZ29vZ2xlLmNvbRoHRXhhbXBsZSABKAEwAhACGAEgAA%3D%3D'

describe('isMigrationUri', () => {
  it('recognizes the export scheme regardless of case or whitespace', () => {
    expect(isMigrationUri('  OTPAUTH-MIGRATION://offline?data=x ')).toBe(true)
  })

  it('rejects a plain otpauth link', () => {
    expect(isMigrationUri('otpauth://totp/a?secret=JBSWY3DP')).toBe(false)
  })
})

describe('decodeMigrationUri', () => {
  it('decodes the sample export into one usable account', () => {
    const { accounts } = decodeMigrationUri(SAMPLE_URI)

    expect(accounts).toHaveLength(1)
    expect(accounts[0]).toEqual({
      secret: 'JBSWY3DPEHPK3PXP',
      name: 'alice@google.com',
      issuer: 'Example',
      algorithm: 'SHA1',
      digits: 6,
      type: 'totp',
      period: 30,
      counter: 0
    })
  })

  it('reports batch position so multi-QR exports can be tracked', () => {
    const batch = decodeMigrationUri(SAMPLE_URI)
    expect(batch.batchSize).toBe(1)
    expect(batch.batchIndex).toBe(0)
  })

  it('rejects a non-migration URI with a helpful code', () => {
    expect(() => decodeMigrationUri('https://example.com')).toThrow(
      expect.objectContaining({ code: 'NOT_A_MIGRATION_URI' })
    )
  })

  it('rejects a migration URI with no data parameter', () => {
    expect(() => decodeMigrationUri('otpauth-migration://offline')).toThrow(AppError)
  })

  it('rejects a truncated payload rather than returning junk', () => {
    expect(() => decodeMigrationUri('otpauth-migration://offline?data=CjEKCkhlbGxv')).toThrow(
      expect.objectContaining({ code: 'MALFORMED_PAYLOAD' })
    )
  })
})

describe('parseOtpauth', () => {
  it('parses a standard TOTP link', () => {
    const account = parseOtpauth(
      'otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=8&period=60&algorithm=SHA256'
    )
    expect(account).toMatchObject({
      secret: 'JBSWY3DPEHPK3PXP',
      name: 'octocat',
      issuer: 'GitHub',
      digits: 8,
      period: 60,
      algorithm: 'SHA256',
      type: 'totp'
    })
  })

  it('accepts a bare secret with spaces', () => {
    expect(parseOtpauth('jbsw y3dp ehpk 3pxp', 'Manual')).toMatchObject({
      secret: 'JBSWY3DPEHPK3PXP',
      name: 'Manual',
      digits: 6,
      period: 30
    })
  })

  it('falls back to sane defaults for silly period values', () => {
    expect(parseOtpauth('otpauth://totp/x?secret=JBSWY3DP&period=0').period).toBe(30)
  })

  it('rejects a link with an unusable secret', () => {
    expect(() => parseOtpauth('otpauth://totp/x?secret=!!!!')).toThrow(
      expect.objectContaining({ code: 'MALFORMED_PAYLOAD' })
    )
  })
})
