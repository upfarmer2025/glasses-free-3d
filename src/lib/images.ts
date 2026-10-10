import type { PhotoAsset, Rgb } from '../types'

const VIEW_MAX = 1600
const INFER_MAX = 768
const MAX_BYTES = 20 * 1024 * 1024

export async function preparePhoto(file: File): Promise<PhotoAsset> {
  if (file.size > MAX_BYTES) {
    throw new Error('size')
  }
  if (!isSupportedImage(file)) {
    throw new Error('type')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('decode')
  }

  if (bitmap.width < 8 || bitmap.height < 8) {
    bitmap.close()
    throw new Error('decode')
  }

  const view = drawScaled(bitmap, VIEW_MAX)
  const inference = drawScaled(bitmap, INFER_MAX)
  bitmap.close()

  const edge = averageBorderColor(view)
  return {
    name: file.name || '未命名图片',
    previewUrl: URL.createObjectURL(file),
    view,
    inference,
    edge,
    atmosphere: buildAtmosphere(view, edge),
    floor: buildFloor(edge),
    plate: blurCanvas(view, 42),
  }
}

export function friendlyImageError(error: unknown): string {
  const raw = error instanceof Error ? error.message : ''
  if (raw === 'size') return '这张图片超过 20 MB。请换一张小一些的 JPG、PNG 或 WebP。'
  if (raw === 'type') return '请上传 JPG、PNG 或 WebP。HEIC 等格式请先导出成 JPG。'
  return '这张图片读不出来。请换一张 JPG、PNG 或 WebP。'
}

export async function fileFromSample(url: string, name: string): Promise<File> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('sample')
  const blob = await response.blob()
  return new File([blob], name, { type: blob.type || 'image/jpeg' })
}

function isSupportedImage(file: File): boolean {
  if (/^image\/(jpeg|png|webp)$/.test(file.type)) return true
  return /\.(jpe?g|png|webp)$/i.test(file.name)
}

function drawScaled(bitmap: ImageBitmap, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('decode')
  ctx.fillStyle = '#f4f1ec'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  return canvas
}

function averageBorderColor(canvas: HTMLCanvasElement): Rgb {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return { r: 90, g: 80, b: 70 }
  const { width, height } = canvas
  const pixels = ctx.getImageData(0, 0, width, height).data
  const mx = Math.max(2, Math.round(width * 0.08))
  const my = Math.max(2, Math.round(height * 0.08))
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= mx && x < width - mx && y >= my && y < height - my) continue
      const i = (y * width + x) * 4
      r += pixels[i]
      g += pixels[i + 1]
      b += pixels[i + 2]
      n++
    }
  }
  if (n === 0) return { r: 90, g: 80, b: 70 }
  return { r: r / n, g: g / n, b: b / n }
}

/**
 * The surround is a color field taken from the photo's edges, not a generated
 * scene. Center pixels (usually the person) are left out so they don't smear
 * into a ghost on the side walls.
 */
export function buildAtmosphere(source: HTMLCanvasElement, edge: Rgb): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas

  ctx.fillStyle = rgb(edge)
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.globalAlpha = 0.55
  ctx.drawImage(edgeCollage(source), 0, 0, canvas.width, canvas.height)
  ctx.globalAlpha = 1

  const shade = ctx.createLinearGradient(0, 0, 0, canvas.height)
  shade.addColorStop(0, 'rgba(0,0,0,0.42)')
  shade.addColorStop(0.2, 'rgba(0,0,0,0.05)')
  shade.addColorStop(0.72, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return canvas
}

export function buildFloor(edge: Rgb): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const glow = ctx.createRadialGradient(256, 256, 20, 256, 256, 256)
  glow.addColorStop(0, `rgba(${edge.r | 0}, ${edge.g | 0}, ${edge.b | 0}, 0.92)`)
  glow.addColorStop(0.5, `rgba(${(edge.r * 0.4) | 0}, ${(edge.g * 0.4) | 0}, ${(edge.b * 0.4) | 0}, 0.72)`)
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 512, 512)
  return canvas
}

export function blurCanvas(source: HTMLCanvasElement, longSide: number): HTMLCanvasElement {
  const scale = longSide / Math.max(source.width, source.height)
  const tiny = document.createElement('canvas')
  tiny.width = Math.max(1, Math.round(source.width * scale))
  tiny.height = Math.max(1, Math.round(source.height * scale))
  const tinyCtx = tiny.getContext('2d')
  const out = document.createElement('canvas')
  out.width = source.width
  out.height = source.height
  const ctx = out.getContext('2d')
  if (!tinyCtx || !ctx) return source
  tinyCtx.drawImage(source, 0, 0, tiny.width, tiny.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(tiny, 0, 0, out.width, out.height)
  return out
}

function edgeCollage(source: HTMLCanvasElement): HTMLCanvasElement {
  const sw = source.width
  const sh = source.height
  const margin = Math.max(4, Math.round(Math.min(sw, sh) * 0.14))
  const collage = document.createElement('canvas')
  collage.width = sw
  collage.height = sh
  const ctx = collage.getContext('2d')
  if (!ctx) return source
  ctx.drawImage(source, 0, 0, margin, sh, 0, 0, sw / 2, sh)
  ctx.drawImage(source, sw - margin, 0, margin, sh, sw / 2, 0, sw / 2, sh)
  ctx.drawImage(source, 0, 0, sw, margin, 0, 0, sw, sh * 0.35)
  ctx.drawImage(source, 0, sh - margin, sw, margin, 0, sh * 0.65, sw, sh * 0.35)

  const tiny = document.createElement('canvas')
  tiny.width = 32
  tiny.height = 16
  tiny.getContext('2d')?.drawImage(collage, 0, 0, tiny.width, tiny.height)
  const soft = document.createElement('canvas')
  soft.width = 256
  soft.height = 128
  const softCtx = soft.getContext('2d')
  if (!softCtx) return tiny
  softCtx.imageSmoothingEnabled = true
  softCtx.drawImage(tiny, 0, 0, soft.width, soft.height)
  return soft
}

function rgb(color: Rgb): string {
  return `rgb(${color.r | 0}, ${color.g | 0}, ${color.b | 0})`
}
