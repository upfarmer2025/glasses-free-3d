import { runDepthEstimator, type DepthBytes } from './depthModel'

export type DepthProgress = {
  phase: 'download' | 'infer'
  ratio?: number
}

type Pending = {
  onProgress: (progress: DepthProgress) => void
  resolve: (depth: DepthBytes) => void
  reject: (error: Error) => void
}

type WorkerEvent =
  | { type: 'warm' }
  | { type: 'progress'; id?: number; phase: 'download' | 'infer'; ratio?: number }
  | { type: 'depth'; id: number; width: number; height: number; data: Uint8Array }
  | { type: 'error'; id?: number; message: string }

let worker: Worker | null = null
let workerBroken = false
let warmed = false
let warmListener: ((status: 'loading' | 'ready' | 'failed', progress?: DepthProgress) => void) | null = null
let activeJobId: number | null = null
const pending = new Map<number, Pending>()
let nextId = 1

export function warmupDepthModel(
  onStatus?: (status: 'loading' | 'ready' | 'failed', progress?: DepthProgress) => void,
) {
  if (onStatus) warmListener = onStatus
  if (warmed || workerBroken) return
  warmed = true
  try {
    ensureWorker().postMessage({ type: 'warmup' })
  } catch (error) {
    workerBroken = true
    warmListener?.('failed')
    console.warn('Depth worker failed to start', error)
  }
}

export async function estimateDepthMap(
  canvas: HTMLCanvasElement,
  onProgress: (progress: DepthProgress) => void,
): Promise<DepthBytes> {
  if (!workerBroken) {
    try {
      const bitmap = await createImageBitmap(canvas)
      return await estimateInWorker(bitmap, onProgress)
    } catch (error) {
      console.warn('Depth worker failed', error)
      const timedOut = error instanceof Error && error.message.includes('超时')
      if (timedOut) throw error
      workerBroken = true
    }
  }

  onProgress({ phase: 'infer' })
  return withTimeout(
    runDepthEstimator(canvas, (ratio, status) => {
      if (status === 'progress' || status === 'progress_total' || status === 'download' || status === 'initiate') {
        onProgress({ phase: 'download', ratio })
      }
    }),
    180_000,
    '景深模型超时',
  )
}

function estimateInWorker(bitmap: ImageBitmap, onProgress: (progress: DepthProgress) => void): Promise<DepthBytes> {
  const id = nextId++
  activeJobId = id
  const current = ensureWorker()
  return withTimeout(
    new Promise<DepthBytes>((resolve, reject) => {
      pending.set(id, { onProgress, resolve, reject })
      current.postMessage({ type: 'estimate', id, bitmap }, [bitmap])
    }),
    180_000,
    '景深模型超时',
  ).finally(() => {
    if (activeJobId === id) activeJobId = null
  })
}

function ensureWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/depth.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<WorkerEvent>) => {
    const message = event.data
    if (message.type === 'warm') {
      warmListener?.('ready')
      return
    }
    if (message.type === 'progress') {
      const progress = { phase: message.phase, ratio: message.ratio }
      if (message.id !== undefined) pending.get(message.id)?.onProgress(progress)
      else {
        warmListener?.('loading', progress)
        if (activeJobId !== null) pending.get(activeJobId)?.onProgress(progress)
      }
      return
    }
    if (message.type === 'depth') {
      const job = pending.get(message.id)
      pending.delete(message.id)
      job?.resolve(message)
      return
    }
    const error = new Error(message.message)
    if (message.id !== undefined) {
      const job = pending.get(message.id)
      pending.delete(message.id)
      job?.reject(error)
      return
    }
    workerBroken = true
    warmListener?.('failed')
  }
  worker.onerror = (event) => {
    workerBroken = true
    const error = new Error(event.message || '景深模型无法启动')
    for (const job of pending.values()) job.reject(error)
    pending.clear()
  }
  return worker
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}
