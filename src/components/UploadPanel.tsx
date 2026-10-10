import { useEffect, useRef } from 'react'
import { ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { paintDepthPreview } from '@/lib/depth'
import type { DepthField, PhotoAsset } from '@/types'

type Props = {
  photo: PhotoAsset | null
  depth: DepthField | null
  inverted: boolean
  busy: boolean
  dragging: boolean
  modelLabel: string
  onFile: (file: File) => void
  onInvert: () => void
  onRetry: () => void
  onSampleError: (message: string) => void
}

export function UploadPanel({
  photo,
  depth,
  inverted,
  busy,
  dragging,
  modelLabel,
  onFile,
  onInvert,
  onRetry,
  onSampleError,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <aside className="space-y-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-6 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-copper/70 ${
          dragging ? 'border-copper bg-copper/10' : 'border-white/15 bg-panel/80 hover:border-copper/50'
        }`}
      >
        <ImagePlus className="size-6 text-copper" aria-hidden="true" />
        <span className="text-sm text-paper">拖拽图片到页面任意位置，或点击选择</span>
        <span className="text-xs text-mist">JPG、PNG、WebP，最大 20 MB</span>
      </button>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        aria-label="选择图片"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void loadSample('/samples/portrait.jpg', '人像示例.jpg', onFile, onSampleError)}
        >
          人像示例
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void loadSample('/samples/landscape.jpg', '风景示例.jpg', onFile, onSampleError)}
        >
          风景示例
        </Button>
      </div>
      <p className="text-xs leading-5 text-mist">示例图片的作者和许可写在 README 里。人像更容易看出脸和肩膀怎么从背景里浮出来。</p>
      <p className="text-xs leading-5 text-mist">{modelLabel}</p>

      {photo && (
        <figure className="space-y-2">
          <figcaption className="flex items-center justify-between gap-3 text-xs text-mist">
            <span className="truncate">{photo.name}</span>
            <span className="shrink-0 tabular-nums">
              {photo.view.width} × {photo.view.height}
            </span>
          </figcaption>
          <img src={photo.previewUrl} alt="上传的原图" className="max-h-64 w-full rounded-xl border border-white/10 object-contain bg-black" />
        </figure>
      )}

      {depth && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-mist">景深 · {inverted ? '已反转，亮处更远' : '亮处更近'}</p>
            <button type="button" className="text-xs text-copper underline-offset-2 hover:underline" onClick={onInvert}>
              反转远近
            </button>
          </div>
          <DepthThumb depth={depth} inverted={inverted} />
          <p className="text-xs leading-5 text-mist">
            {depth.source === 'model' ? 'Depth Anything V2 Small，在本机估计的相对远近。' : depth.note}
          </p>
          {depth.source === 'fallback' && (
            <Button variant="outline" size="sm" disabled={busy} onClick={onRetry}>
              重新分析
            </Button>
          )}
        </div>
      )}
    </aside>
  )
}

function DepthThumb({ depth, inverted }: { depth: DepthField; inverted: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const painted = paintDepthPreview(depth, inverted)
    const canvas = ref.current
    if (!canvas) return
    canvas.width = painted.width
    canvas.height = painted.height
    canvas.getContext('2d')?.drawImage(painted, 0, 0)
  }, [depth, inverted])

  return (
    <canvas
      ref={ref}
      aria-label={inverted ? '景深预览，亮处表示更远' : '景深预览，亮处表示更近'}
      className="max-h-40 w-full rounded-xl border border-white/10 bg-black object-contain"
    />
  )
}

async function loadSample(
  url: string,
  name: string,
  onFile: (file: File) => void,
  onError: (message: string) => void,
) {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('sample')
    const blob = await response.blob()
    onFile(new File([blob], name, { type: blob.type || 'image/jpeg' }))
  } catch {
    onError('示例图片没有加载出来。请换一张自己的照片，或刷新后再试。')
  }
}
