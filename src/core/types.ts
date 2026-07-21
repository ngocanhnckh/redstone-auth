/** Shared domain types. No Electron or Node imports — safe on both sides of the IPC bridge. */

export type OtpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'
export type OtpType = 'totp' | 'hotp'

/** A full credential, including the secret. Never leaves the main process. */
export interface Account {
  id: string
  /** Base32-encoded shared secret (RFC 4648, no padding). */
  secret: string
  /** Account name, e.g. "alice@example.com". */
  name: string
  /** Provider, e.g. "GitHub". May be empty. */
  issuer: string
  algorithm: OtpAlgorithm
  digits: 6 | 8
  type: OtpType
  /** Period in seconds (TOTP only). */
  period: number
  /** Counter (HOTP only). */
  counter: number
}

/** The sanitized view the renderer is allowed to see. Contains no secret. */
export interface AccountView {
  id: string
  name: string
  issuer: string
  digits: 6 | 8
  type: OtpType
  period: number
}

/** One tick of generated codes, pushed from main to renderer every second. */
export interface CodeTick {
  id: string
  /** The current code, already grouped for display, e.g. "492 173". */
  code: string
  /** Seconds until this code expires. */
  secondsRemaining: number
  /** 0 → just refreshed, 1 → about to expire. Drives the countdown visuals. */
  progress: number
}

export interface VaultStatus {
  /** A vault file exists on disk — the user should be asked to unlock, not to create. */
  exists: boolean
  unlocked: boolean
  accountCount: number
}

/** Error codes crossing the IPC boundary, so the UI can react without parsing strings. */
export type AppErrorCode =
  | 'INVALID_PASSWORD'
  | 'VAULT_CORRUPT'
  | 'NO_VAULT'
  | 'LOCKED'
  | 'NOT_A_MIGRATION_URI'
  | 'MALFORMED_PAYLOAD'
  | 'DUPLICATE'
  | 'NOT_FOUND'
  | 'IO_ERROR'
  | 'WEAK_PASSWORD'

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export interface ImportResult {
  imported: number
  skipped: number
  total: number
}

export function toView(account: Account): AccountView {
  return {
    id: account.id,
    name: account.name,
    issuer: account.issuer,
    digits: account.digits,
    type: account.type,
    period: account.period
  }
}
