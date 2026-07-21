/** One easing signature for the whole app — half of what makes motion feel designed. */
export const ease = [0.22, 1, 0.36, 1] as const

/** Masked line reveal: content slides up from behind its own edge. */
export const riseVariants = {
  hidden: { y: 40, opacity: 0 },
  show: (index: number) => ({
    y: 0,
    opacity: 1,
    transition: { duration: 0.9, ease, delay: 0.1 + index * 0.09 }
  })
}

export const listContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.12 } }
}

export const listItem = {
  hidden: { y: 22, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { duration: 0.6, ease } }
}
