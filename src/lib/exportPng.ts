import { toPng } from 'html-to-image'

/**
 * Decodes a base64 data URL into a Blob without going through fetch() —
 * the production CSP's connect-src doesn't (and shouldn't need to) allow
 * data: URLs, so fetch(dataUrl) gets blocked there even though it works
 * in dev where no CSP is sent.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/data:(.*?);base64/)?.[1] ?? 'image/png'
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: mime })
}

/**
 * Renders a DOM node (already sized at exact pixels) to a PNG blob.
 * cacheBust helps html-to-image inline the proxied images.
 */
export async function nodeToPngBlob(node: HTMLElement): Promise<Blob> {
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 1,
    // The node renders off-screen; make sure its own background is captured.
    backgroundColor: '#0d0b14',
  })
  return dataUrlToBlob(dataUrl)
}
