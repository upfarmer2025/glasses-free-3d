import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Chip, Field, ProgressBar, Viewfinder } from '@/components/controls'
import { useCanvasTexture, useDepthTexture } from '@/components/textures'
import { Slider } from '@/components/ui/slider'
import { createDisplacedMaterial, type DisplaceUniforms } from '@/lib/displace'
import type { DepthField, LoadPhase, PhotoAsset } from '@/types'

type Props = {
  photo: PhotoAsset
  depth: DepthField | null
  inverted: boolean
  busy: boolean
  phase: LoadPhase | null
}

export function NakedEyeView({ photo, depth, inverted, busy, phase }: Props) {
  const [strength, setStrength] = useState(68)
  const [wiggle, setWiggle] = useState(true)
  const [follow, setFollow] = useState(true)

  return (
    <div className="space-y-4">
      <Viewfinder className="h-[68vh] min-h-[420px]">
        {depth ? (
          <Canvas
            className="h-full w-full"
            dpr={[1, 1.75]}
            camera={{ fov: 30, position: [0, 0, 4], near: 0.01, far: 40 }}
            gl={{
              antialias: true,
              toneMapping: THREE.NoToneMapping,
              outputColorSpace: THREE.SRGBColorSpace,
              alpha: false,
            }}
          >
            <color attach="background" args={['#12100e']} />
            <ParallaxScene
              photo={photo}
              depth={depth}
              strength={(strength / 100) * 1.15}
              inverted={inverted}
              wiggle={wiggle}
              follow={follow}
            />
          </Canvas>
        ) : (
          <img src={photo.previewUrl} alt="原图预览" className="h-full w-full object-contain" />
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
          <Chip pressed={wiggle} onClick={() => setWiggle((value) => !value)}>
            自动摆动
          </Chip>
          <Chip pressed={follow} onClick={() => setFollow((value) => !value)}>
            跟随指针
          </Chip>
        </div>
      </div>

      <p className="text-sm leading-6 text-mist">
        这是普通屏幕上的视差，不是柱镜硬件立体。近处被轻轻顶出画面，摆动或移动指针时，人和物体比背景位移更大，看起来像从照片里浮出来。五官和背景仍是原图像素。头发、玻璃和细小遮挡可能粘在一起；角度太大时，边缘会被拉开。
      </p>
      {!wiggle && !follow && depth && (
        <p className="text-sm text-copper">打开摆动或移动指针，前后层次才会显现。正对画面时，浮雕几乎看不出来。</p>
      )}
    </div>
  )
}

function ParallaxScene({
  photo,
  depth,
  strength,
  inverted,
  wiggle,
  follow,
}: {
  photo: PhotoAsset
  depth: DepthField
  strength: number
  inverted: boolean
  wiggle: boolean
  follow: boolean
}) {
  const photoTex = useCanvasTexture(photo.view)
  const plateTex = useCanvasTexture(photo.plate)
  const depthTex = useDepthTexture(depth.data, depth.width, depth.height)
  const aspect = photo.view.width / Math.max(1, photo.view.height)
  const planeH = 1.7
  const planeW = planeH * aspect
  const uniforms = useRef<DisplaceUniforms>({
    uDepth: { value: depthTex },
    uStrength: { value: strength },
    uInvert: { value: inverted ? 1 : 0 },
    uPop: { value: 0.07 },
    uEdgeColor: { value: new THREE.Color('#000000') },
  })

  useLayoutEffect(() => {
    uniforms.current.uDepth.value = depthTex
    uniforms.current.uStrength.value = strength
    uniforms.current.uInvert.value = inverted ? 1 : 0
  }, [depthTex, inverted, strength])

  const geometry = useMemo(() => {
    const segX = Math.round(140 * Math.min(Math.max(aspect, 0.7), 1.6))
    const segY = Math.round(140 * Math.min(Math.max(1 / aspect, 0.7), 1.6))
    return new THREE.PlaneGeometry(planeW, planeH, segX, segY)
  }, [aspect, planeH, planeW])

  const material = useMemo(() => createDisplacedMaterial(photoTex, uniforms.current, 'plane'), [photoTex])

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame((state) => {
    uniforms.current.uStrength.value = strength
    uniforms.current.uInvert.value = inverted ? 1 : 0
    const t = state.clock.elapsedTime
    // The camera has to travel a sizable fraction of the photo, otherwise the
    // depth relief reads as a flat image in a still frame.
    const fx = follow ? state.pointer.x * planeW * 0.24 : 0
    const fy = follow ? state.pointer.y * planeH * 0.14 : 0
    const wx = wiggle ? Math.sin(t * 1.05) * planeW * 0.2 : 0
    const wy = wiggle ? Math.sin(t * 0.62) * planeH * 0.07 : 0
    const restX = planeW * 0.07
    const camera = state.camera
    camera.position.x += (restX + fx + wx - camera.position.x) * 0.08
    camera.position.y += (fy + wy - camera.position.y) * 0.08
    camera.lookAt(0, 0, 0)
  })

  return (
    <>
      <FitCamera width={planeW} height={planeH} />
      <BoostTexture texture={photoTex} />
      <mesh position={[0, 0, -0.22]} scale={[1.35, 1.35, 1]}>
        <planeGeometry args={[planeW, planeH]} />
        <meshBasicMaterial map={plateTex} color="#8d8478" toneMapped={false} />
      </mesh>
      <mesh geometry={geometry} material={material} />
    </>
  )
}

function FitCamera({ width, height }: { width: number; height: number }) {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  useLayoutEffect(() => {
    const persp = camera as THREE.PerspectiveCamera
    const aspect = size.width / Math.max(1, size.height)
    const vFov = (persp.fov * Math.PI) / 180
    const distH = height / 2 / Math.tan(vFov / 2)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    const distW = width / 2 / Math.tan(hFov / 2)
    persp.position.z = Math.max(distH, distW) * 1.34
    persp.near = 0.01
    persp.far = Math.max(30, persp.position.z * 8)
    persp.updateProjectionMatrix()
  }, [camera, height, size.height, size.width, width])
  return null
}

function BoostTexture({ texture }: { texture: THREE.Texture }) {
  const gl = useThree((state) => state.gl)
  useLayoutEffect(() => {
    texture.anisotropy = gl.capabilities.getMaxAnisotropy()
    texture.needsUpdate = true
  }, [gl, texture])
  return null
}
