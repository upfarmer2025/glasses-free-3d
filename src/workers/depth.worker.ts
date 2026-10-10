import { loadDepthEstimator, runDepthEstimator } from '../lib/depthModel'

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<Inbound>) => void) | null
  postMessage: (message: unknown, transfer?: Transferable[]) => void
}

type Inbound =
  | { type: 'warmup' }
  | { type: 'estimate'; id: number; bitmap: ImageBitmap }

let queue: Promise<void> = Promise.resolve()

scope.onmessage = (event: MessageEvent<Inbound>) => {
  const message = event.data
  if (message.type === 'warmup') {
    void loadDepthEstimator((ratio, status) => {
      if (status === 'progress' || status === 'progress_total' || status === 'download' || status === 'initiate') {
        scope.postMessage({ type: 'progress', phase: 'download', ratio })
      }
    })
      .then(() => {
        scope.postMessage({ type: 'warm' })
      })
      .catch((error: unknown) => {
        scope.postMessage({ type: 'error', message: errorText(error) })
      })
    return
  }

  queue = queue
    .then(() => estimate(message.id, message.bitmap))
    .catch(() => undefined)
}

async function estimate(id: number, bitmap: ImageBitmap) {
  try {
    scope.postMessage({ type: 'progress', id, phase: 'infer' })
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建离屏画布')
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const depth = await runDepthEstimator(canvas, (ratio, status) => {
      if (status === 'progress' || status === 'progress_total') {
        scope.postMessage({ type: 'progress', id, phase: 'download', ratio })
      }
    })
    scope.postMessage(
      { type: 'depth', id, width: depth.width, height: depth.height, data: depth.data },
      [depth.data.buffer],
    )
  } catch (error) {
    try {
      bitmap.close()
    } catch {
      // The bitmap may already have been transferred or closed.
    }
    scope.postMessage({ type: 'error', id, message: errorText(error) })
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
