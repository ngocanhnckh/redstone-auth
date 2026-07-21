import type { ImportResult } from '@core/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from '../lib/api'
import { decodeImage, decodeVideoFrame, imageFromClipboard } from '../lib/qr'
import { Modal } from './Modal'

type Mode = 'image' | 'camera' | 'manual'

interface Props {
  open: boolean
  onClose: () => void
  onImported: (summary: string) => void
}

const TABS: { id: Mode; label: string }[] = [
  { id: 'image', label: 'QR image' },
  { id: 'camera', label: 'Camera' },
  { id: 'manual', label: 'Manual' }
]

export function ImportPanel({ open, onClose, onImported }: Props): React.JSX.Element {
  const [mode, setMode] = useState<Mode>('image')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submitUri = useCallback(
    async (text: string) => {
      setBusy(true)
      setError(null)
      try {
        if (text.trim().toLowerCase().startsWith('otpauth-migration://')) {
          const result: ImportResult = await api.importMigration(text)
          onImported(describe(result))
        } else {
          const account = await api.addAccount(text)
          onImported(`Added ${account.issuer || account.name}.`)
        }
        onClose()
      } catch (failure) {
        setError(errorMessage(failure))
      } finally {
        setBusy(false)
      }
    },
    [onClose, onImported]
  )

  useEffect(() => {
    if (open) {
      setError(null)
      setMode('image')
    }
  }, [open])

  return (
    <Modal open={open} onClose={onClose} kicker="Import" title="Bring your accounts across" width={620}>
      <div className="mb-6 flex gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setMode(tab.id)
              setError(null)
            }}
            className={`glass-inset glass-inset-hover rounded-full px-4 py-2 text-[0.74rem] tracking-[0.12em] uppercase ${
              mode === tab.id ? 'border border-[rgb(var(--primary-soft)/0.6)]' : 'border border-transparent'
            }`}
            style={{ color: mode === tab.id ? 'var(--color-clay-2)' : 'var(--app-text-soft)' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'image' && <ImageMode onDecoded={submitUri} onError={setError} busy={busy} />}
      {mode === 'camera' && <CameraMode active={open} onDecoded={submitUri} onError={setError} />}
      {mode === 'manual' && <ManualMode onSubmit={submitUri} busy={busy} />}

      {error && (
        <p className="mono mt-5 text-[0.78rem]" style={{ color: 'var(--color-clay-2)' }}>
          {error}
        </p>
      )}

      <p className="mt-6 text-[0.78rem] leading-relaxed" style={{ color: 'var(--app-text-faint)' }}>
        In Google Authenticator: <strong style={{ color: 'var(--app-text-soft)' }}>Menu → Transfer accounts → Export accounts</strong>.
        Screenshot the QR, or point your camera at the phone. Large exports produce several QR codes — import each one.
      </p>
    </Modal>
  )
}

function ImageMode({
  onDecoded,
  onError,
  busy
}: {
  onDecoded: (text: string) => void
  onError: (message: string) => void
  busy: boolean
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [hovering, setHovering] = useState(false)

  const handleBlob = useCallback(
    async (blob: Blob) => {
      try {
        onDecoded(await decodeImage(blob))
      } catch (failure) {
        onError(errorMessage(failure))
      }
    },
    [onDecoded, onError]
  )

  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const blob = imageFromClipboard(event)
      if (blob) void handleBlob(blob)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleBlob])

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setHovering(true)
        }}
        onDragLeave={() => setHovering(false)}
        onDrop={(event) => {
          event.preventDefault()
          setHovering(false)
          const file = Array.from(event.dataTransfer.files).find((candidate) =>
            candidate.type.startsWith('image/')
          )
          if (file) void handleBlob(file)
          else onError('That file is not an image.')
        }}
        onClick={() => inputRef.current?.click()}
        className="glass-inset flex h-[210px] cursor-default flex-col items-center justify-center rounded-[20px] border-2 border-dashed transition-colors duration-200"
        style={{
          borderColor: hovering ? 'rgb(var(--primary-soft) / 0.8)' : 'var(--app-border-strong)'
        }}
      >
        <p className="display mb-2 text-[1.6rem]" style={{ color: 'var(--app-text)' }}>
          {busy ? 'Reading…' : 'Drop the QR screenshot'}
        </p>
        <p className="mono text-[0.72rem] tracking-[0.14em] uppercase" style={{ color: 'var(--app-text-faint)' }}>
          or click to browse — or press ⌘V to paste
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void handleBlob(file)
          event.target.value = ''
        }}
      />
    </div>
  )
}

function CameraMode({
  active,
  onDecoded,
  onError
}: {
  active: boolean
  onDecoded: (text: string) => void
  onError: (message: string) => void
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    if (!active) return
    let stream: MediaStream | null = null
    let scanTimer: number | null = null
    let cancelled = false

    const start = async (): Promise<void> => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } }
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setLive(true)

        scanTimer = window.setInterval(() => {
          const found = decodeVideoFrame(video)
          if (found) {
            if (scanTimer) window.clearInterval(scanTimer)
            onDecoded(found)
          }
        }, 280)
      } catch {
        onError('Camera unavailable. Grant camera access in System Settings → Privacy & Security.')
      }
    }

    void start()

    return () => {
      cancelled = true
      if (scanTimer) window.clearInterval(scanTimer)
      stream?.getTracks().forEach((track) => track.stop())
      setLive(false)
    }
  }, [active, onDecoded, onError])

  return (
    <div className="glass-inset overflow-hidden rounded-[20px] border border-[var(--app-border)]">
      <video ref={videoRef} muted playsInline className="h-[280px] w-full bg-black object-cover" />
      <p className="mono px-4 py-3 text-[0.72rem] tracking-[0.14em] uppercase" style={{ color: 'var(--app-text-faint)' }}>
        {live ? 'Scanning — hold the export QR steady' : 'Starting camera…'}
      </p>
    </div>
  )
}

function ManualMode({
  onSubmit,
  busy
}: {
  onSubmit: (text: string) => void
  busy: boolean
}): React.JSX.Element {
  const [value, setValue] = useState('')

  return (
    <div>
      <label className="index-numeral mb-2 block" htmlFor="manual-uri">
        OTPAUTH URI OR BASE32 SECRET
      </label>
      <textarea
        id="manual-uri"
        rows={4}
        className="field field--mono resize-none"
        placeholder="otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button
        type="button"
        disabled={busy || value.trim().length === 0}
        onClick={() => onSubmit(value.trim())}
        className="glass-btn glass-btn--clay mt-4 w-full px-6 py-3 text-[0.78rem] tracking-[0.2em] uppercase"
      >
        {busy ? 'Adding…' : 'Add account'}
      </button>
    </div>
  )
}

function describe(result: ImportResult): string {
  if (result.imported === 0) {
    return `Nothing new — all ${result.total} account${result.total === 1 ? '' : 's'} were already here.`
  }
  const skipped = result.skipped > 0 ? `, ${result.skipped} already present` : ''
  return `Imported ${result.imported} account${result.imported === 1 ? '' : 's'}${skipped}.`
}
