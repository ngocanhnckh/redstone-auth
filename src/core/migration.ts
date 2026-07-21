/**
 * Decodes Google Authenticator's "Export accounts" QR payload.
 *
 * The QR encodes `otpauth-migration://offline?data=<base64 MigrationPayload>`,
 * where MigrationPayload is:
 *
 *   message MigrationPayload {
 *     repeated OtpParameters otp_parameters = 1;
 *     int32 version = 2; int32 batch_size = 3;
 *     int32 batch_index = 4; int32 batch_id = 5;
 *   }
 *   message OtpParameters {
 *     bytes secret = 1; string name = 2; string issuer = 3;
 *     Algorithm algorithm = 4;   // 1 SHA1, 2 SHA256, 3 SHA512, 4 MD5
 *     DigitCount digits = 5;     // 1 SIX, 2 EIGHT
 *     OtpType type = 6;          // 1 HOTP, 2 TOTP
 *     int64 counter = 7;
 *   }
 */

import { encodeBase32 } from './base32'
import { readMessage, WireType } from './protobuf'
import { AppError, type Account, type OtpAlgorithm } from './types'

/** An account parsed out of a migration payload; the store assigns the id. */
export type ParsedAccount = Omit<Account, 'id'>

export interface MigrationBatch {
  accounts: ParsedAccount[]
  batchIndex: number
  batchSize: number
}

const ALGORITHMS: Record<number, OtpAlgorithm> = { 0: 'SHA1', 1: 'SHA1', 2: 'SHA256', 3: 'SHA512' }

/** Google Authenticator only ever issues 30-second TOTP; the payload omits the period. */
const GOOGLE_PERIOD = 30

export function isMigrationUri(uri: string): boolean {
  return uri.trim().toLowerCase().startsWith('otpauth-migration://')
}

export function decodeMigrationUri(uri: string): MigrationBatch {
  const trimmed = uri.trim()
  if (!isMigrationUri(trimmed)) {
    throw new AppError(
      'NOT_A_MIGRATION_URI',
      'That QR code is not a Google Authenticator export. Use "Transfer accounts → Export accounts" in the app.'
    )
  }

  const data = extractDataParam(trimmed)
  let payload: Uint8Array
  try {
    payload = decodeBase64(data)
  } catch {
    throw new AppError('MALFORMED_PAYLOAD', 'The export payload is not valid base64.')
  }

  try {
    return decodeMigrationPayload(payload)
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(
      'MALFORMED_PAYLOAD',
      `The export payload could not be decoded: ${(error as Error).message}`
    )
  }
}

export function decodeMigrationPayload(payload: Uint8Array): MigrationBatch {
  const accounts: ParsedAccount[] = []
  let batchIndex = 0
  let batchSize = 1

  for (const field of readMessage(payload)) {
    if (field.fieldNumber === 1 && field.wireType === WireType.LengthDelimited) {
      accounts.push(decodeOtpParameters(field.bytes!))
    } else if (field.fieldNumber === 3 && field.wireType === WireType.Varint) {
      batchSize = Number(field.value)
    } else if (field.fieldNumber === 4 && field.wireType === WireType.Varint) {
      batchIndex = Number(field.value)
    }
  }

  if (accounts.length === 0) {
    throw new AppError('MALFORMED_PAYLOAD', 'The export contains no accounts.')
  }
  return { accounts, batchIndex, batchSize }
}

function decodeOtpParameters(buf: Uint8Array): ParsedAccount {
  let secret: Uint8Array | undefined
  let name = ''
  let issuer = ''
  let algorithmCode = 1
  let digitsCode = 1
  let typeCode = 2
  let counter = 0

  const text = new TextDecoder()

  for (const field of readMessage(buf)) {
    switch (field.fieldNumber) {
      case 1:
        secret = field.bytes
        break
      case 2:
        name = text.decode(field.bytes)
        break
      case 3:
        issuer = text.decode(field.bytes)
        break
      case 4:
        algorithmCode = Number(field.value)
        break
      case 5:
        digitsCode = Number(field.value)
        break
      case 6:
        typeCode = Number(field.value)
        break
      case 7:
        counter = Number(field.value)
        break
    }
  }

  if (!secret || secret.length === 0) {
    throw new AppError('MALFORMED_PAYLOAD', 'An exported account is missing its secret.')
  }
  const algorithm = ALGORITHMS[algorithmCode]
  if (!algorithm) {
    throw new AppError(
      'MALFORMED_PAYLOAD',
      `Unsupported algorithm in export (code ${algorithmCode}).`
    )
  }

  // GA writes the label as "Issuer:name" when an issuer is set; split it so the
  // UI doesn't show the issuer twice.
  const separator = name.indexOf(':')
  if (separator > 0 && !issuer) {
    issuer = name.slice(0, separator).trim()
    name = name.slice(separator + 1).trim()
  } else if (separator > 0 && name.slice(0, separator).trim() === issuer) {
    name = name.slice(separator + 1).trim()
  }

  return {
    secret: encodeBase32(secret),
    name: name.trim(),
    issuer: issuer.trim(),
    algorithm,
    digits: digitsCode === 2 ? 8 : 6,
    type: typeCode === 1 ? 'hotp' : 'totp',
    period: GOOGLE_PERIOD,
    counter
  }
}

function extractDataParam(uri: string): string {
  // Not using `new URL()`: the payload's `+` and `/` survive better with a
  // direct read, and the scheme is non-standard.
  const match = /[?&]data=([^&]+)/.exec(uri)
  if (!match) {
    throw new AppError('MALFORMED_PAYLOAD', 'The export link has no `data` parameter.')
  }
  return decodeURIComponent(match[1])
}

function decodeBase64(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')
  const buffer = Buffer.from(normalized, 'base64')
  if (buffer.length === 0) throw new Error('empty payload')
  return new Uint8Array(buffer)
}
