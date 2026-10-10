import { Component, useEffect, useRef, useState, type ReactNode } from 'react'
import { NakedEyeView } from '@/components/NakedEyeView'
import { SpatialView } from '@/components/SpatialView'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Viewfinder } from '@/components/controls'
import { UploadPanel } from '@/components/UploadPanel'
import { depthFieldFromModel, fallbackDepth, friendlyDepthError } from '@/lib/depth'
import { estimateDepthMap, warmupDepthModel } from '@/lib/depthClient'
import { friendlyImageError, preparePhoto } from '@/lib/images'
import type { DepthField, LoadPhase, PhotoAsset } from '@/types'

type TabId = 'parallax' | 'spatial'

export default function App() {
  const [photo, setPhoto] = useState<PhotoAsset | null>(null)
  const [depth, setDepth] = useState<DepthField | null>(null)
  const [tab, setTab] = useState<TabId>('parallax')
  const [inverted, setInverted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<LoadPhase | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [modelLabel, setModelLabel] = useState('景深模型会在打开页面后开始准备。')
  const generation = useRef(0)
  const dragDepth = useRef(0)
  const runRef = useRef<(file: File) => void>(() => undefined)

  useEffect(() => {
    warmupDepthModel((status, progress) => {
      if (status === 'ready') {
        setModelLabel('景深模型已就绪，上传后会直接分析。')
        return
      }
      if (status === 'failed') {
        setModelLabel('景深模型还没准备好。上传后会再试一次，不行就用快速近似。')
        return
      }
      const ratio = progress?.ratio
      setModelLabel(
        ratio === undefined
          ? '正在准备景深模型…'
          : `正在准备景深模型 ${Math.round(ratio * 100)}%`,
      )
    })
  }, [])

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
    }
    const onDragLeave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const file = event.dataTransfer.files[0]
      if (file) runRef.current(file)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  async function process(file: File, forceModel = false) {
    const id = ++generation.current
    setError(null)
    setBusy(true)
    setPhase({
      title: '正在读取图片',
      detail: '按拍摄方向摆正，并准备一份用于预览的画面。',
    })

    let asset = photo
    if (!forceModel || !photo) {
      try {
        asset = await preparePhoto(file)
      } catch (reason) {
        if (generation.current !== id) return
        setBusy(false)
        setPhase(null)
        setError(friendlyImageError(reason))
        return
      }
      if (generation.current !== id) {
        URL.revokeObjectURL(asset.previewUrl)
        return
      }
      setPhoto((current) => {
        if (current) URL.revokeObjectURL(current.previewUrl)
        return asset
      })
      setDepth(null)
    }

    if (!asset) {
      setBusy(false)
      setPhase(null)
      return
    }

    setPhase({
      title: '正在分析远近',
      detail: '首次使用会下载 Depth Anything V2 Small（约 27 MB）。模型在这台设备上运行，照片不会上传。',
    })

    try {
      const bytes = await estimateDepthMap(asset.inference, (progress) => {
        if (generation.current !== id) return
        if (progress.phase === 'download') {
          setPhase({
            title: '正在下载景深模型',
            detail: 'Depth Anything V2 Small 的 q4 量化权重，大约 27 MB。下完会留在浏览器缓存里。',
            ratio: progress.ratio,
          })
          return
        }
        setPhase({
          title: '正在分析远近',
          detail: '模型在这台设备上运行，照片不会离开浏览器。',
        })
      })
      if (generation.current !== id) return
      setDepth(depthFieldFromModel(bytes.data, bytes.width, bytes.height, 'model'))
      setModelLabel('景深来自 Depth Anything V2 Small。')
    } catch (reason) {
      if (generation.current !== id) return
      console.warn(reason)
      setPhase({
        title: '改用快速近似',
        detail: '模型没有完成，正在用画面结构估一个前后层次。',
      })
      try {
        const approximate = fallbackDepth(asset.inference, friendlyDepthError(reason))
        if (generation.current !== id) return
        setDepth(approximate)
      } catch (fallbackReason) {
        if (generation.current !== id) return
        setError(friendlyImageError(fallbackReason))
      }
    } finally {
      if (generation.current === id) {
        setBusy(false)
        setPhase(null)
      }
    }
  }

  useEffect(() => {
    runRef.current = (file) => {
      void process(file)
    }
  })

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 lg:px-8">
          <p className="text-xs tracking-[0.18em] text-copper">IMAGE → DEPTH → SPACE</p>
          <h1 className="font-serif text-4xl text-paper">立体视界</h1>
          <p className="max-w-2xl text-sm leading-6 text-mist">
            上传一张照片，看裸眼 3D 视差，或走进可以 360° 环视的空间场景。计算在浏览器里完成，不需要账号，照片也不会上传到服务器。
          </p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-8">
        <UploadPanel
          photo={photo}
          depth={depth}
          inverted={inverted}
          busy={busy}
          dragging={dragging}
          modelLabel={modelLabel}
          onFile={(file) => void process(file)}
          onInvert={() => setInverted((value) => !value)}
          onRetry={() => {
            if (!photo) return
            const file = new File([], photo.name)
            void process(file, true)
          }}
          onSampleError={(message) => setError(message)}
        />

        <section className="min-w-0 space-y-4">
          <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
            <TabsList aria-label="预览方式">
              <TabsTrigger value="parallax">裸眼 3D</TabsTrigger>
              <TabsTrigger value="spatial">空间场景</TabsTrigger>
            </TabsList>
          </Tabs>

          {error && (
            <p className="rounded-xl border border-copper/40 bg-copper/10 px-4 py-3 text-sm leading-6 text-paper" role="alert">
              {error}
            </p>
          )}

          {!photo && (
            <Viewfinder className="flex h-[68vh] min-h-[420px] items-center justify-center">
              <div className="max-w-sm px-6 text-center">
                <p className="font-serif text-2xl">先放进一张照片</p>
                <p className="mt-3 text-sm leading-6 text-mist">
                  人像、静物或风景都可以。主体和背景拉开一点距离时，立体感更明显。两个预览共用同一张景深。
                </p>
              </div>
            </Viewfinder>
          )}

          {photo && (
            <PreviewBoundary>
              {tab === 'parallax' ? (
                <NakedEyeView photo={photo} depth={depth} inverted={inverted} busy={busy} phase={phase} />
              ) : (
                <SpatialView photo={photo} depth={depth} inverted={inverted} busy={busy} phase={phase} />
              )}
            </PreviewBoundary>
          )}
        </section>
      </main>
    </div>
  )
}

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <Viewfinder className="flex h-[68vh] min-h-[420px] items-center justify-center">
          <p className="max-w-sm px-6 text-center text-sm leading-6 text-mist">
            三维预览没有启动。请换一个较新的桌面浏览器，或刷新页面后再试。
          </p>
        </Viewfinder>
      )
    }
    return this.props.children
  }
}
