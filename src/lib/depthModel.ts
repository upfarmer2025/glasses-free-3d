import { env, pipeline, type ProgressInfo } from '@huggingface/transformers'

// Browser demo: skip the local /models lookup and download the quantized
// checkpoint from the Hugging Face hub. q4 is about 27 MB and runs on WASM
// without WebGPU or cross-origin isolation.
env.allowLocalModels = false

export const DEPTH_MODEL_ID = 'onnx-community/depth-anything-v2-small'

export type DepthBytes = {
  data: Uint8Array
  width: number
  height: number
}

type DepthEstimator = (image: OffscreenCanvas | HTMLCanvasElement) => Promise<{
  depth: { data: Uint8Array | Uint8ClampedArray; width: number; height: number }
}>

let loading: Promise<DepthEstimator> | null = null

export function loadDepthEstimator(
  onProgress?: (ratio: number | undefined, status: string | undefined) => void,
): Promise<DepthEstimator> {
  if (!loading) {
    loading = pipeline('depth-estimation', DEPTH_MODEL_ID, {
      dtype: 'q4',
      device: 'wasm',
      progress_callback: (info: ProgressInfo) => {
        onProgress?.(progressRatio(info), info.status)
      },
    })
      .then((estimator) => estimator as unknown as DepthEstimator)
      .catch((error: unknown) => {
        loading = null
        throw error
      })
  }
  return loading
}

export async function runDepthEstimator(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  onProgress?: (ratio: number | undefined, status: string | undefined) => void,
): Promise<DepthBytes> {
  const estimator = await loadDepthEstimator(onProgress)
  const output = await estimator(canvas)
  const copy = new Uint8Array(output.depth.data)
  return { data: copy, width: output.depth.width, height: output.depth.height }
}

function progressRatio(info: ProgressInfo): number | undefined {
  if (info.status !== 'progress' && info.status !== 'progress_total') return undefined
  return Math.min(1, Math.max(0, info.progress / 100))
}
