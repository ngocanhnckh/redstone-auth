/** Parses and builds standard single-account `otpauth://` URIs (Key Uri Format). */

import { decodeBase32 } from './base32'
import type { ParsedAccount } from './migration'
import { AppError, type OtpAlgorithm } from './types'

export function isOtpauthUri(uri: string): boolean {
  return uri.trim().toLowerCase().startsWith('otpauth://')
}

/**
 * Accepts either a full `otpauth://totp/...` URI or a bare base32 secret,
 * so pasting whatever the provider gave you tends to work.
 */
export function parseOtpauth(input: string, fallbackName = 'Account'): ParsedAccount {
  const trimmed = input.trim()
  if (!isOtpauthUri(trimmed)) return fromBareSecret(trimmed, fallbackName)

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new AppError('MALFORMED_PAYLOAD', 'That otpauth:// link could not be parsed.')
  }

  const type = url.host.toLowerCase() === 'hotp' ? 'hotp' : 'totp'
  const label = decodeURIComponent(url.pathname.replace(/^\//, ''))
  const separator = label.indexOf(':')
  const labelIssuer = separator > 0 ? label.slice(0, separator).trim() : ''
  const name = (separator > 0 ? label.slice(separator + 1) : label).trim()

  const secret = (url.searchParams.get('secret') ?? '').trim()
  assertUsableSecret(secret)

  const digits = url.searchParams.get('digits') === '8' ? 8 : 6
  const period = clampPeriod(Number(url.searchParams.get('period')))

  return {
    secret: secret.toUpperCase().replace(/[\s=-]/g, ''),
    name: name || fallbackName,
    issuer: (url.searchParams.get('issuer') ?? labelIssuer).trim(),
    algorithm: normalizeAlgorithm(url.searchParams.get('algorithm')),
    digits,
    type,
    period,
    counter: Number(url.searchParams.get('counter') ?? 0) || 0
  }
}

function fromBareSecret(secret: string, name: string): ParsedAccount {
  assertUsableSecret(secret)
  return {
    secret: secret.toUpperCase().replace(/[\s=-]/g, ''),
    name,
    issuer: '',
    algorithm: 'SHA1',
    digits: 6,
    type: 'totp',
    period: 30,
    counter: 0
  }
}

function assertUsableSecret(secret: string): void {
  if (!secret) throw new AppError('MALFORMED_PAYLOAD', 'No secret found.')
  try {
    if (decodeBase32(secret).length === 0) throw new Error('empty')
  } catch {
    throw new AppError('MALFORMED_PAYLOAD', 'The secret is not valid base32.')
  }
}

function normalizeAlgorithm(raw: string | null): OtpAlgorithm {
  switch ((raw ?? '').toUpperCase()) {
    case 'SHA256':
      return 'SHA256'
    case 'SHA512':
      return 'SHA512'
    default:
      return 'SHA1'
  }
}

function clampPeriod(period: number): number {
  return Number.isFinite(period) && period >= 15 && period <= 300 ? Math.floor(period) : 30
}
