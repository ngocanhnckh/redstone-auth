import { AnimatePresence, motion } from 'motion/react'
import { createPortal } from 'react-dom'
import { ease } from '../lib/motion'

export interface ToastMessage {
  id: number
  text: string
  tone: 'neutral' | 'alert'
}

export function Toasts({ messages }: { messages: ToastMessage[] }): React.JSX.Element {
  return createPortal(
    <div className="pointer-events-none fixed bottom-8 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence initial={false}>
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.4, ease }}
            className="glass-menu rounded-full border px-5 py-2.5 text-[0.8rem]"
            style={{
              borderColor:
                message.tone === 'alert' ? 'rgb(var(--primary-soft) / 0.6)' : 'var(--app-border)',
              color: message.tone === 'alert' ? 'var(--color-clay-2)' : 'var(--app-text)'
            }}
          >
            {message.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  )
}
