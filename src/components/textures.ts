import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

export function useCanvasTexture(canvas: HTMLCanvasElement) {
  const texture = useMemo(() => {
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    tex.needsUpdate = true
    return tex
  }, [canvas])

  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

export function useDepthTexture(data: Float32Array, width: number, height: number) {
  const texture = useMemo(() => {
    const bytes = new Uint8Array(data.length)
    for (let i = 0; i < data.length; i++) {
      bytes[i] = Math.round(Math.min(1, Math.max(0, data[i])) * 255)
    }
    // Row 0 is the top of the photo. flipY matches CanvasTexture's orientation.
    const tex = new THREE.DataTexture(bytes, width, height, THREE.RedFormat, THREE.UnsignedByteType)
    tex.colorSpace = THREE.NoColorSpace
    tex.flipY = true
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.generateMipmaps = false
    tex.needsUpdate = true
    return tex
  }, [data, width, height])

  useEffect(() => () => texture.dispose(), [texture])
  return texture
}
