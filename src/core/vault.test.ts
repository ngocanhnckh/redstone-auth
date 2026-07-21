import { describe, expect, it } from 'vitest'
import { decryptVault, encryptVault, verifyPassword } from './vault'
import type { Account } from './types'

const accounts: Account[] = [
  {
    id: 'a1',
    secret: 'JBSWY3DPEHPK3PXP',
    name: 'alice@google.com',
    issuer: 'Example',
    algorithm: 'SHA1',
    digits: 6,
    type: 'totp',
    period: 30,
    counter: 0
  }
]

const PASSWORD = 'correct horse battery'

describe('vault', () => {
  it('round-trips accounts through encryption', () => {
    const file = encryptVault({ accounts }, PASSWORD)
    expect(decryptVault(file, PASSWORD).accounts).toEqual(accounts)
  })

  it('never writes a secret in the clear', () => {
    const file = encryptVault({ accounts }, PASSWORD)
    expect(JSON.stringify(file)).not.toContain('JBSWY3DPEHPK3PXP')
    expect(JSON.stringify(file)).not.toContain('alice@google.com')
  })

  it('uses a fresh salt and IV per write, so identical vaults differ on disk', () => {
    const first = encryptVault({ accounts }, PASSWORD)
    const second = encryptVault({ accounts }, PASSWORD)
    expect(first.ct).not.toBe(second.ct)
    expect(first.kdf.salt).not.toBe(second.kdf.salt)
    expect(first.iv).not.toBe(second.iv)
  })

  it('rejects the wrong password with INVALID_PASSWORD', () => {
    const file = encryptVault({ accounts }, PASSWORD)
    expect(() => decryptVault(file, 'wrong password!')).toThrow(
      expect.objectContaining({ code: 'INVALID_PASSWORD' })
    )
    expect(verifyPassword(file, PASSWORD)).toBe(true)
    expect(verifyPassword(file, 'nope nope nope')).toBe(false)
  })

  it('detects tampered ciphertext', () => {
    const file = encryptVault({ accounts }, PASSWORD)
    const bytes = Buffer.from(file.ct, 'base64')
    bytes[0] ^= 0xff
    expect(() => decryptVault({ ...file, ct: bytes.toString('base64') }, PASSWORD)).toThrow()
  })

  it('detects a tampered auth tag', () => {
    const file = encryptVault({ accounts }, PASSWORD)
    const tag = Buffer.from(file.tag, 'base64')
    tag[0] ^= 0xff
    expect(() => decryptVault({ ...file, tag: tag.toString('base64') }, PASSWORD)).toThrow()
  })

  it('refuses a malformed vault file', () => {
    expect(() => decryptVault({} as never, PASSWORD)).toThrow(
      expect.objectContaining({ code: 'VAULT_CORRUPT' })
    )
  })

  it('refuses a vault written by a newer version', () => {
    const file = encryptVault({ accounts }, PASSWORD)
    expect(() => decryptVault({ ...file, v: 99 }, PASSWORD)).toThrow(
      expect.objectContaining({ code: 'VAULT_CORRUPT' })
    )
  })

  it('refuses absurd KDF parameters that would hang the app', () => {
    const file = encryptVault({ accounts }, PASSWORD)
    expect(() => decryptVault({ ...file, kdf: { ...file.kdf, N: 1 << 24 } }, PASSWORD)).toThrow(
      expect.objectContaining({ code: 'VAULT_CORRUPT' })
    )
  })

  it('rejects a password that is too short to be worth encrypting with', () => {
    expect(() => encryptVault({ accounts }, 'short')).toThrow(
      expect.objectContaining({ code: 'WEAK_PASSWORD' })
    )
  })
})
