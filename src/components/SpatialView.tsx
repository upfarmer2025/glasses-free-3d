import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { Chip, Field, ProgressBar, Viewfinder } from '@/components/controls'
import { useCanvasTexture, useDepthTexture } from '@/components/textures'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { createDisplacedMaterial, createStageGeometry, stageLayout, type DisplaceUniforms } from '@/lib/displace'
import type { DepthField, LoadPhase, PhotoAsset } from '@/types'

type LookMode = 'look' | 'orbit'

type Props = {
  photo: PhotoAsset
  depth: DepthField | null
  inverted: boolean
  busy: boolean
  phase: LoadPhase | null
}

export function SpatialView({ photo, depth, inverted, busy, phase }: Props) {
  const [strength, setStrength] = useState(46)
  const [mode, setMode] = useState<LookMode>('look')
  const [resetKey, setResetKey] = useState(0)
  const yaw = useRef(0)
  const pitch = useRef(0)
  const fov = useRef(62)

  function resetView() {
    yaw.current = 0
    pitch.current = 0
    fov.current = 62
    setResetKey((value) => value + 1)
  }

  return (
    <div className="space-y-4">
      <Viewfinder className={`h-[68vh] min-h-[420px] ${mode === 'look' ? 'cursor-grab active:cursor-grabbing' : ''}`}>
        {depth ? (
          <Canvas
            className="h-full w-full touch-none"
            dpr={[1, 1.75]}
            camera={{ fov: 62, position: [0, 0.06, 0], near: 0.05, far: 80 }}
            gl={{
              antialias: true,
              toneMapping: THREE.NoToneMapping,
              outputColorSpace: THREE.SRGBColorSpace,
              alpha: false,
            }}
          >
            <color attach="background" args={['#100e0c']} />
            <fog attach="fog" args={['#100e0c', 7.5, 16]} />
            <Room
              photo={photo}
              depth={depth}
              strength={(strength / 100) * 1.45}
              inverted={inverted}
              mode={mode}
              resetKey={resetKey}
              yaw={yaw}
              pitch={pitch}
              fov={fov}
            />
          </Canvas>
        ) : (
          <img src={photo.previewUrl} alt="原图预览" className="h-full w-full object-contain" />
        )}
        {depth && (
          <p className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-full bg-black/45 px-3 py-1 text-xs text-paper/90">
            {mode === 'look' ? '拖动环视 · 滚轮缩放 · 方向键' : '拖动环绕 · 滚轮远近'}
          </p>
        )}
        {busy && phase && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 p-6 backdrop-blur-[2px]">
            <div className="w-full max-w-sm space-y-3 text-center">
              <p className="font-serif text-xl">{phase.title}</p>
              <p className="text-sm leading-6 text-mist">{phase.detail}</p>
              <ProgressBar ratio={phase.ratio} />
            </div>
          </div>
        )}
      </Viewfinder>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="景深强度" value={`${strength}`}>
          <Slider
            aria-label="景深强度"
            min={0}
            max={100}
            step={1}
            value={[strength]}
            onValueChange={(value) => setStrength(value[0] ?? 0)}
            disabled={!depth}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Chip pressed={mode === 'look'} onClick={() => setMode('look')}>
            环视
          </Chip>
          <Chip pressed={mode === 'orbit'} onClick={() => setMode('orbit')}>
            环绕
          </Chip>
          <Button variant="outline" size="sm" onClick={resetView}>
            重置视角
          </Button>
        </div>
      </div>

      <p className="text-sm leading-6 text-mist">
        相机站在照片前面。环视可以转满 360°，环绕则绕着这张立体照片观看。正面保留原图，近处向你凸起，人和背景的细节都还在。照片盖不住的侧面和背后，是用画面边缘的色彩铺成的氛围，不是生成出来的真实房间。转到边缘时，画面会慢慢淡进这层颜色。
      </p>
    </div>
  )
}

function Room({
  photo,
  depth,
  strength,
  inverted,
  mode,
  resetKey,
  yaw,
  pitch,
  fov,
}: {
  photo: PhotoAsset
  depth: DepthField
  strength: number
  inverted: boolean
  mode: LookMode
  resetKey: number
  yaw: RefObject<number>
  pitch: RefObject<number>
  fov: RefObject<number>
}) {
  const aspect = photo.view.width / Math.max(1, photo.view.height)
  const layout = useMemo(() => stageLayout(aspect), [aspect])
  const photoTex = useCanvasTexture(photo.view)
  const atmosphereTex = useCanvasTexture(photo.atmosphere)
  const floorTex = useCanvasTexture(photo.floor)
  const depthTex = useDepthTexture(depth.data, depth.width, depth.height)
  const edgeColor = useMemo(() => {
    const color = new THREE.Color()
    color.setRGB(photo.edge.r / 255, photo.edge.g / 255, photo.edge.b / 255, THREE.SRGBColorSpace)
    return color
  }, [photo.edge])

  const uniforms = useRef<DisplaceUniforms>({
    uDepth: { value: depthTex },
    uStrength: { value: strength },
    uInvert: { value: inverted ? 1 : 0 },
    uPop: { value: 0 },
    uEdgeColor: { value: edgeColor },
  })

  useLayoutEffect(() => {
    uniforms.current.uDepth.value = depthTex
    uniforms.current.uStrength.value = strength
    uniforms.current.uInvert.value = inverted ? 1 : 0
    uniforms.current.uEdgeColor.value = edgeColor
  }, [depthTex, edgeColor, inverted, strength])

  const geometry = useMemo(
    () => createStageGeometry(layout.arc, layout.radius, layout.height),
    [layout.arc, layout.height, layout.radius],
  )
  const material = useMemo(() => createDisplacedMaterial(photoTex, uniforms.current, 'stage'), [photoTex])

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame(() => {
    uniforms.current.uStrength.value = strength
    uniforms.current.uInvert.value = inverted ? 1 : 0
  })

  return (
    <>
      <BoostTexture texture={photoTex} />
      <LookRig enabled={mode === 'look'} yaw={yaw} pitch={pitch} fov={fov} resetKey={resetKey} />
      <DragLook enabled={mode === 'look'} yaw={yaw} pitch={pitch} fov={fov} />
      <KeyLook enabled={mode === 'look'} yaw={yaw} pitch={pitch} />
      <OrbitRig active={mode === 'orbit'} resetKey={resetKey} radius={layout.radius} />
      <mesh geometry={geometry} material={material} />
      <mesh rotation={[0, Math.PI, 0]}>
        <sphereGeometry args={[13.5, 48, 32]} />
        <meshBasicMaterial map={atmosphereTex} side={THREE.BackSide} toneMapped={false} fog />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -layout.height / 2, 0]}>
        <circleGeometry args={[8, 64]} />
        <meshBasicMaterial map={floorTex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  )
}

function LookRig({
  enabled,
  yaw,
  pitch,
  fov,
  resetKey,
}: {
  enabled: boolean
  yaw: RefObject<number>
  pitch: RefObject<number>
  fov: RefObject<number>
  resetKey: number
}) {
  useFrame(({ camera }) => {
    if (!enabled) return
    const persp = camera as THREE.PerspectiveCamera
    persp.position.set(0, 0.06, 0)
    persp.rotation.order = 'YXZ'
    persp.rotation.y = yaw.current ?? 0
    persp.rotation.x = pitch.current ?? 0
    persp.rotation.z = 0
    const nextFov = fov.current ?? 62
    if (persp.fov !== nextFov) {
      persp.fov = nextFov
      persp.updateProjectionMatrix()
    }
  })
  useLayoutEffect(() => {
    if (!enabled) return
    yaw.current = 0
    pitch.current = 0
    fov.current = 62
  }, [enabled, fov, pitch, resetKey, yaw])
  return null
}

function DragLook({
  enabled,
  yaw,
  pitch,
  fov,
}: {
  enabled: boolean
  yaw: RefObject<number>
  pitch: RefObject<number>
  fov: RefObject<number>
}) {
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    const el = gl.domElement
    let down = false
    let x = 0
    let y = 0
    const onDown = (event: PointerEvent) => {
      if (!enabled) return
      down = true
      x = event.clientX
      y = event.clientY
      el.setPointerCapture(event.pointerId)
    }
    const onMove = (event: PointerEvent) => {
      if (!down || !enabled) return
      yaw.current = (yaw.current ?? 0) - (event.clientX - x) * 0.0052
      const nextPitch = (pitch.current ?? 0) - (event.clientY - y) * 0.0034
      pitch.current = Math.min(0.72, Math.max(-0.55, nextPitch))
      x = event.clientX
      y = event.clientY
    }
    const onUp = () => {
      down = false
    }
    const onWheel = (event: WheelEvent) => {
      if (!enabled) return
      event.preventDefault()
      const next = (fov.current ?? 62) + Math.sign(event.deltaY) * 2.2
      fov.current = Math.min(78, Math.max(42, next))
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      el.removeEventListener('wheel', onWheel)
    }
  }, [enabled, fov, gl, pitch, yaw])
  return null
}

function KeyLook({
  enabled,
  yaw,
  pitch,
}: {
  enabled: boolean
  yaw: RefObject<number>
  pitch: RefObject<number>
}) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowLeft') yaw.current = (yaw.current ?? 0) + 0.06
      if (event.key === 'ArrowRight') yaw.current = (yaw.current ?? 0) - 0.06
      if (event.key === 'ArrowUp') pitch.current = Math.min(0.72, (pitch.current ?? 0) + 0.04)
      if (event.key === 'ArrowDown') pitch.current = Math.max(-0.55, (pitch.current ?? 0) - 0.04)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, pitch, yaw])
  return null
}

function OrbitRig({ active, resetKey, radius }: { active: boolean; resetKey: number; radius: number }) {
  const camera = useThree((state) => state.camera)
  const target = useMemo<[number, number, number]>(() => [0, 0, -radius * 0.92], [radius])
  useLayoutEffect(() => {
    if (!active) return
    camera.position.set(0.15, 0.12, 0.15)
    camera.lookAt(target[0], target[1], target[2])
    const persp = camera as THREE.PerspectiveCamera
    persp.fov = 62
    persp.updateProjectionMatrix()
  }, [active, camera, resetKey, target])
  if (!active) return null
  return (
    <OrbitControls
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={0.85}
      maxDistance={8}
      minPolarAngle={0.28}
      maxPolarAngle={Math.PI - 0.28}
      target={target}
    />
  )
}

function BoostTexture({ texture }: { texture: THREE.Texture }) {
  const gl = useThree((state) => state.gl)
  useLayoutEffect(() => {
    texture.anisotropy = gl.capabilities.getMaxAnisotropy()
    texture.needsUpdate = true
  }, [gl, texture])
  return null
}
