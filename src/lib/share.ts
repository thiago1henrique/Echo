import { downloadBlob } from './download'

/** Saves a blob to the user's device (the web equivalent of "Salvar na galeria"). */
export function saveBlob(blob: Blob, filename: string): void {
  downloadBlob(blob, filename)
}

/**
 * Opens the system share sheet with the file when the browser supports sharing
 * files (mobile Chrome/Safari); otherwise downloads it. Returns `'shared'`,
 * `'downloaded'` or `'cancelled'` (the user dismissed the sheet — not an error).
 */
export async function shareBlob(
  blob: Blob,
  filename: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], filename, { type: blob.type })
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return 'cancelled'
      // Any other failure: fall through to a plain download.
    }
  }
  downloadBlob(blob, filename)
  return 'downloaded'
}
