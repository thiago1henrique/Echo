import { toPng } from 'html-to-image'

/**
 * Renders a DOM node (already sized at exact pixels) to a PNG blob.
 * cacheBust + fetchRequestInit help html-to-image inline the proxied images.
 */
export async function nodeToPngBlob(node: HTMLElement): Promise<Blob> {
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 1,
    // The node renders off-screen; make sure its own background is captured.
    backgroundColor: '#0d0b14',
  })
  const res = await fetch(dataUrl)
  return res.blob()
}
