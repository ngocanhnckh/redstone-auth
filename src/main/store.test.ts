import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { codeFor } from '../core/totp'
import { VaultStore } from './store'

const SAMPLE_URI =
  'otpauth-migration://offline?data=CjEKCkhlbGxvId6tvu8SGEV4YW1wbGU6YWxpY2VAZ29vZ2xlLmNvbRoHRXhhbXBsZSABKAEwAhACGAEgAA%3D%3D'

const PASSWORD = 'a good long password'

let directory: string
let vaultPath: string
let store: VaultStore

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'redstone-'))
  vaultPath = join(directory, 'vault.enc')
  store = new VaultStore(vaultPath)
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('VaultStore', () => {
  it('creates, locks and unlocks a vault', () => {
    expect(store.status()).toMatchObject({ exists: false, unlocked: false })

    store.create(PASSWORD)
    expect(store.status()).toMatchObject({ exists: true, unlocked: true, accountCount: 0 })

    store.lock()
    expect(store.isUnlocked).toBe(false)

    store.unlock(PASSWORD)
    expect(store.isUnlocked).toBe(true)
  })

  it('refuses to overwrite an existing vault', () => {
    store.create(PASSWORD)
    expect(() => new VaultStore(vaultPath).create('another password')).toThrow(
      expect.objectContaining({ code: 'IO_ERROR' })
    )
  })

  it('rejects the wrong password on unlock', () => {
    store.create(PASSWORD)
    store.lock()
    expect(() => store.unlock('not the password')).toThrow(
      expect.objectContaining({ code: 'INVALID_PASSWORD' })
    )
  })

  it('refuses every operation while locked', () => {
    store.create(PASSWORD)
    store.lock()
    expect(() => store.list()).toThrow(expect.objectContaining({ code: 'LOCKED' }))
    expect(() => store.importMigrationUri(SAMPLE_URI)).toThrow(
      expect.objectContaining({ code: 'LOCKED' })
    )
  })

  it('imports a Google Authenticator export and generates the right code', () => {
    store.create(PASSWORD)
    const result = store.importMigrationUri(SAMPLE_URI)

    expect(result).toEqual({ imported: 1, skipped: 0, total: 1 })
    expect(store.list()[0]).toMatchObject({ issuer: 'Example', name: 'alice@google.com' })

    // The imported secret is the well-known JBSWY3DPEHPK3PXP vector.
    expect(codeFor(store.all()[0], 0)).toBe('282760')
  })

  it('skips accounts it already holds instead of duplicating them', () => {
    store.create(PASSWORD)
    store.importMigrationUri(SAMPLE_URI)
    expect(store.importMigrationUri(SAMPLE_URI)).toEqual({ imported: 0, skipped: 1, total: 1 })
    expect(store.list()).toHaveLength(1)
  })

  it('survives a lock/unlock round trip with accounts intact', () => {
    store.create(PASSWORD)
    store.importMigrationUri(SAMPLE_URI)
    store.lock()
    store.unlock(PASSWORD)
    expect(store.list()).toHaveLength(1)
  })

  it('writes nothing readable to disk', () => {
    store.create(PASSWORD)
    store.importMigrationUri(SAMPLE_URI)
    const onDisk = readFileSync(vaultPath, 'utf8')
    expect(onDisk).not.toContain('alice@google.com')
    expect(onDisk).not.toContain('JBSWY3DPEHPK3PXP')
  })

  it('adds, renames and deletes a manual account', () => {
    store.create(PASSWORD)
    const added = store.addManual('otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub')
    expect(added).toMatchObject({ issuer: 'GitHub', name: 'octocat' })

    store.rename(added.id, 'octocat-2', 'GitHub Inc')
    expect(store.list()[0]).toMatchObject({ name: 'octocat-2', issuer: 'GitHub Inc' })

    store.remove(added.id)
    expect(store.list()).toHaveLength(0)
  })

  it('rejects a duplicate manual add', () => {
    store.create(PASSWORD)
    const uri = 'otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub'
    store.addManual(uri)
    expect(() => store.addManual(uri)).toThrow(expect.objectContaining({ code: 'DUPLICATE' }))
  })

  it('advances an HOTP counter and persists it', () => {
    store.create(PASSWORD)
    const added = store.addManual('otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=5')
    expect(store.bumpCounter(added.id)).toBe(6)

    store.lock()
    store.unlock(PASSWORD)
    expect(store.all()[0].counter).toBe(6)
  })

  it('round-trips an encrypted backup', () => {
    store.create(PASSWORD)
    store.importMigrationUri(SAMPLE_URI)

    const backupPath = join(directory, 'backup.vault')
    store.exportBackup(backupPath)

    const fresh = new VaultStore(join(directory, 'other.enc'))
    fresh.create('a different long password')
    expect(fresh.importBackup(backupPath, PASSWORD)).toEqual({ imported: 1, skipped: 0, total: 1 })
    expect(fresh.list()[0]).toMatchObject({ name: 'alice@google.com' })
  })

  it('re-encrypts under a new master password', () => {
    store.create(PASSWORD)
    store.importMigrationUri(SAMPLE_URI)
    store.changePassword(PASSWORD, 'an even better password')
    store.lock()

    expect(() => store.unlock(PASSWORD)).toThrow()
    store.unlock('an even better password')
    expect(store.list()).toHaveLength(1)
  })

  it('rejects a password change that names the wrong current password', () => {
    store.create(PASSWORD)
    expect(() => store.changePassword('wrong', 'a brand new password')).toThrow(
      expect.objectContaining({ code: 'INVALID_PASSWORD' })
    )
  })

  it('reports a corrupt vault file rather than crashing', () => {
    store.create(PASSWORD)
    store.lock()
    writeFileSync(vaultPath, 'not json at all')
    expect(() => store.unlock(PASSWORD)).toThrow(expect.objectContaining({ code: 'VAULT_CORRUPT' }))
  })
})
