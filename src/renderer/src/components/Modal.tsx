import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ease } from '../lib/motion'

interface Props {
  open: boolean
  title: string
  kicker?: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}

/**
 * Rendered through a portal at the document root: an ancestor with
 * `backdrop-filter` creates a stacking context that would otherwise trap the
 * dialog behind the page content.
 */
export function Modal({ open, title, kicker, onClose, children, width = 560 }: Props): React.JSX.Element {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease }}
            onClick={onClose}
            className="absolute inset-0"
            style={{ background: 'rgba(10,7,4,0.55)' }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 26, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.99 }}
            transition={{ duration: 0.45, ease }}
            className="glass-menu relative max-h-full w-full overflow-y-auto rounded-[26px] border border-[var(--app-border-strong)] p-8 no-scrollbar"
            style={{ maxWidth: width }}
          >
            {kicker && <p className="kicker mb-3">{kicker}</p>}
            <h2 className="display mb-6 text-[2rem]" style={{ color: 'var(--app-text)' }}>
              {title}
            </h2>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
