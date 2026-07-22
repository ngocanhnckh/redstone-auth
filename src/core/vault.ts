/**
 * Vault encryption: scrypt-derived key + AES-256-GCM.
 *
 * The file on disk is JSON so it stays inspectable and version-migratable,
 * but every byte of account data lives in the `ct` field, authenticated by
 * the GCM tag. Tampering with the ciphertext or the header fails the tag
 * check and surfaces as VAULT_CORRUPT rather than garbage plaintext.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { AppError, type Account } from './types'

export const VAULT_VERSION = 1

/** ~134 MB of scratch memory and roughly a second of work — deliberate friction for offline guessing. */
const KDF = { N: 1 << 17, r: 8, p: 1, keyLength: 32, maxmem: 256 * 1024 * 1024 } as const

const MIN_PASSWORD_LENGTH = 8

export interface VaultFile {
  v: number
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string }
  iv: string
  tag: string
  ct: string
}

export interface VaultContents {
  accounts: Account[]
}

export function assertUsablePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      'WEAK_PASSWORD',
      `Master password must be at least ${MIN_PASSWORD_LENGTH} characters.`
    )
  }
}

export function encryptVault(contents: VaultContents, password: string): VaultFile {
  assertUsablePassword(password)

  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const key = deriveKey(password, salt)

  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(contents), 'utf8')),
    cipher.final()
  ])

  key.fill(0)

  return {
    v: VAULT_VERSION,
    kdf: { name: 'scrypt', N: KDF.N, r: KDF.r, p: KDF.p, salt: salt.toString('base64') },
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64')
  }
}

export function decryptVault(file: VaultFile, password: string): VaultContents {
  assertVaultShape(file)

  const key = deriveKey(password, Buffer.from(file.kdf.salt, 'base64'), file.kdf)

  let plaintext: Buffer
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(file.tag, 'base64'))
    plaintext = Buffer.concat([
      decipher.update(Buffer.from(file.ct, 'base64')),
      decipher.final()
    ])
  } catch {
    // GCM cannot distinguish "wrong key" from "tampered ciphertext"; a wrong
    // password is overwhelmingly the likelier cause, so we report that.
    throw new AppError('INVALID_PASSWORD', 'Incorrect master password.')
  } finally {
    key.fill(0)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(plaintext.toString('utf8'))
  } catch {
    throw new AppError('VAULT_CORRUPT', 'The vault decrypted but its contents are unreadable.')
  } finally {
    plaintext.fill(0)
  }

  if (!parsed || !Array.isArray((parsed as VaultContents).accounts)) {
    throw new AppError('VAULT_CORRUPT', 'The vault is missing its account list.')
  }
  return parsed as VaultContents
}

/** Confirms a password unlocks a vault without exposing its contents. */
export function verifyPassword(file: VaultFile, password: string): boolean {
  try {
    decryptVault(file, password)
    return true
  } catch {
    return false
  }
}

function deriveKey(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number } = KDF
): Buffer {
  return scryptSync(password.normalize('NFKC'), salt, KDF.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: KDF.maxmem
  })
}

function assertVaultShape(file: VaultFile): void {
  const wellFormed =
    file &&
    typeof file === 'object' &&
    file.kdf?.name === 'scrypt' &&
    typeof file.kdf.salt === 'string' &&
    typeof file.iv === 'string' &&
    typeof file.tag === 'string' &&
    typeof file.ct === 'string'

  if (!wellFormed) {
    throw new AppError('VAULT_CORRUPT', 'The vault file is not in a recognized format.')
  }
  if (file.v > VAULT_VERSION) {
    throw new AppError(
      'VAULT_CORRUPT',
      `This vault was written by a newer version of Redstone Auth (v${file.v}).`
    )
  }
  // Reject absurd KDF parameters so a doctored header can't hang the app.
  if (file.kdf.N > 1 << 20 || file.kdf.r > 32 || file.kdf.p > 16) {
    throw new AppError('VAULT_CORRUPT', 'The vault header has unreasonable KDF parameters.')
  }
}

/** Constant-time compare, used where a mismatch shouldn't leak timing. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
