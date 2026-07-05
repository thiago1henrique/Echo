import { toPng } from 'html-to-image'

/**
 * Exports a DOM node (already sized at exact pixels) to a downloadable PNG.
 * cacheBust + fetchRequestInit help html-to-image inline the proxied images.
 */
export async function downloadNodeAsPng(node: HTMLElement, filename: string) {
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 1,
    // The node renders off-screen; make sure its own background is captured.
    backgroundColor: '#0d0b14',
  })
  const link = document.createElement('a')
  link.download = filename
  link.href = dataUrl
  link.click()
}
