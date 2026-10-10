import type { DepthField, DepthSource } from '../types'

/**
 * Depth Anything's visualization is disparity-like: larger values are closer.
 * Stretch the useful range, then blur just enough to keep faces from spiking
 * into the mesh while hair and shoulders still separate from the background.
 */
export function depthFieldFromModel(
  bytes: Uint8Array,
  width: number,
  height: number,
  source: DepthSource,
  note?: string,
): DepthField {
  const src = new Float32Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) src[i] = bytes[i] / 255
  const stretched = percentileStretch(src, 0.03, 0.97)
  const blurred = gaussianBlur(stretched, width, height, 1.35)
  return { data: blurred, width, height, source, note }
}

export function fallbackDepth(canvas: HTMLCanvasElement, note: string): DepthField {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('无法读取图片像素')
  }
  const { width, height } = canvas
  const pixels = ctx.getImageData(0, 0, width, height)
  const lum = new Float32Array(width * height)
  for (let i = 0, p = 0; i < pixels.data.length; i += 4, p++) {
    lum[p] = (0.2126 * pixels.data[i] + 0.7152 * pixels.data[i + 1] + 0.0722 * pixels.data[i + 2]) / 255
  }

  const low = gaussianBlur(lum, width, height, Math.max(width, height) * 0.04)
  const out = new Float32Array(width * height)
  const cx = width * 0.5
  const cy = height * 0.42
  const sigma = Math.max(width, height) * 0.42

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const dx = (x - cx) / sigma
      const dy = (y - cy) / sigma
      const center = Math.exp(-(dx * dx + dy * dy))
      const ground = y / (height - 1)
      const detail = Math.min(1, Math.abs(lum[i] - low[i]) * 3.2)
      out[i] = center * 0.78 + ground * 0.16 + detail * 0.22
    }
  }

  return {
    data: percentileStretch(gaussianBlur(out, width, height, 1.8), 0.02, 0.98),
    width,
    height,
    source: 'fallback',
    note,
  }
}

export function paintDepthPreview(depth: DepthField, inverted: boolean): HTMLCanvasElement {
  const { width, height, data } = depth
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const image = ctx.createImageData(width, height)
  for (let i = 0; i < data.length; i++) {
    const t = inverted ? 1 - data[i] : data[i]
    image.data[i * 4] = 28 + t * (242 - 28)
    image.data[i * 4 + 1] = 36 + t * (198 - 36)
    image.data[i * 4 + 2] = 42 + t * (140 - 42)
    image.data[i * 4 + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

export function friendlyDepthError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (/timeout|超时/i.test(raw)) {
    return '景深模型等待太久。已改用快速近似景深，层次会比较粗。网络正常后可以重新分析。'
  }
  if (/fetch|network|failed to load|Failed to fetch|404|503|cors/i.test(raw)) {
    return '景深模型没有下载成功。已改用快速近似景深。检查网络后可以重新分析。'
  }
  if (/wasm|onnx|webgpu|runtime/i.test(raw)) {
    return '当前浏览器没能跑起景深模型。已改用快速近似景深。'
  }
  return '景深模型这次没有完成。已改用快速近似景深，可以稍后再试。'
}

function percentileStretch(src: Float32Array, lowQ: number, highQ: number): Float32Array {
  const hist = new Uint32Array(256)
  for (let i = 0; i < src.length; i++) {
    hist[Math.max(0, Math.min(255, Math.round(src[i] * 255)))]++
  }
  const lowCount = src.length * lowQ
  const highCount = src.length * (1 - highQ)
  let lo = 0
  let hi = 255
  let acc = 0
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= lowCount) {
      lo = i
      break
    }
  }
  acc = 0
  for (let i = 255; i >= 0; i--) {
    acc += hist[i]
    if (acc >= highCount) {
      hi = i
      break
    }
  }
  const span = Math.max(1, hi - lo)
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) {
    out[i] = Math.min(1, Math.max(0, (src[i] * 255 - lo) / span))
  }
  return out
}

function gaussianBlur(src: Float32Array, width: number, height: number, sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 2))
  const kernel = new Float32Array(radius * 2 + 1)
  let weight = 0
  for (let i = -radius; i <= radius; i++) {
    const value = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel[i + radius] = value
    weight += value
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= weight

  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k))
        acc += src[y * width + xx] * kernel[k + radius]
      }
      tmp[y * width + x] = acc
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k))
        acc += tmp[yy * width + x] * kernel[k + radius]
      }
      out[y * width + x] = acc
    }
  }

  return out
}
