import jsQR from 'jsqr'

/**
 * QR decoding, renderer-side. The decoded text goes straight to the main
 * process; the image itself never leaves memory and is never written to disk.
 */

export class QrError extends Error {}

/** Reads a QR from an image file, blob, or pasted clipboard image. */
export async function decodeImage(source: Blob): Promise<string> {
  const bitmap = await createImageBitmap(source).catch(() => {
    throw new QrError('That file could not be read as an image.')
  })

  try {
    // Screenshots of a phone screen are often either tiny or huge; a couple of
    // scales dramatically improves the hit rate over a single pass.
    for (const scale of scalesFor(bitmap.width, bitmap.height)) {
      const found = scan(bitmap, scale)
      if (found) return found
    }
  } finally {
    bitmap.close()
  }

  throw new QrError('No QR code found in that image. Try a sharper or larger screenshot.')
}

/** Grabs a frame from a live video element and looks for a QR in it. */
export function decodeVideoFrame(video: HTMLVideoElement): string | null {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return null

  const context = canvasContext(width, height)
  context.drawImage(video, 0, 0, width, height)
  const result = jsQR(context.getImageData(0, 0, width, height).data, width, height, {
    inversionAttempts: 'attemptBoth'
  })
  return result?.data ?? null
}

function scan(bitmap: ImageBitmap, scale: number): string | null {
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  if (width < 32 || height < 32 || width > 8000 || height > 8000) return null

  const context = canvasContext(width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  const result = jsQR(context.getImageData(0, 0, width, height).data, width, height, {
    inversionAttempts: 'attemptBoth'
  })
  return result?.data ?? null
}

function scalesFor(width: number, height: number): number[] {
  const longest = Math.max(width, height)
  if (longest < 500) return [1, 2, 3]
  if (longest > 2200) return [1, 0.5, 1600 / longest]
  return [1, 0.6, 1.6]
}

function canvasContext(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new QrError('Could not create a drawing surface to read the image.')
  return context
}

/** Pulls the first image out of a paste event, if there is one. */
export function imageFromClipboard(event: ClipboardEvent): Blob | null {
  const items = event.clipboardData?.items
  if (!items) return null
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}

/** Pulls the first image file out of a drop event. */
export function imageFromDrop(event: DragEvent): Blob | null {
  const files = event.dataTransfer?.files
  if (!files) return null
  for (const file of files) {
    if (file.type.startsWith('image/')) return file
  }
  return null
}
