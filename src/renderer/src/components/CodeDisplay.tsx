import { AnimatePresence, motion } from 'motion/react'
import { ease } from '../lib/motion'

interface Props {
  code: string
  /** Row position in the list — drives the cascade delay at rollover. */
  row: number
  /** True in the final seconds of the period. */
  expiring: boolean
  size: 'lead' | 'compact'
}

/**
 * The signature moment. Every 30 seconds the whole wall of codes turns over:
 * the old digits slide up behind their own mask while the new ones rise in
 * from below, each row a beat later than the one above it.
 */
export function CodeDisplay({ code, row, expiring, size }: Props): React.JSX.Element {
  const isLead = size === 'lead'

  return (
    <span
      className="wipe-mask"
      style={{ lineHeight: isLead ? 1.05 : 1.15 }}
      aria-live="off"
      aria-label={`Code ${code.replace(/\s/g, '')}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={code}
          initial={{ y: '110%' }}
          animate={{ y: '0%' }}
          exit={{ y: '-110%' }}
          transition={{ duration: 0.62, ease, delay: Math.min(row, 12) * 0.038 }}
          className={`code block ${expiring ? 'code--expiring' : ''}`}
          style={{
            fontSize: isLead ? 'clamp(2.6rem, 5.4vw, 4.2rem)' : '1.42rem',
            color: expiring ? undefined : 'var(--app-text)'
          }}
        >
          {code}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/** Placeholder shown for the instant before the first tick arrives. */
export function CodePlaceholder({ size }: { size: 'lead' | 'compact' }): React.JSX.Element {
  return (
    <span
      className="code block"
      style={{
        fontSize: size === 'lead' ? 'clamp(2.6rem, 5.4vw, 4.2rem)' : '1.42rem',
        color: 'var(--app-text-faint)'
      }}
    >
      {size === 'lead' ? '••• •••' : '••• •••'}
    </span>
  )
}
