export type DepthSource = 'model' | 'fallback'

export type Rgb = {
  r: number
  g: number
  b: number
}

/** Normalized depth: 1 is near the camera, 0 is far. */
export type DepthField = {
  data: Float32Array
  width: number
  height: number
  source: DepthSource
  note?: string
}

export type PhotoAsset = {
  name: string
  previewUrl: string
  view: HTMLCanvasElement
  inference: HTMLCanvasElement
  edge: Rgb
  atmosphere: HTMLCanvasElement
  floor: HTMLCanvasElement
  plate: HTMLCanvasElement
}

export type LoadPhase = {
  title: string
  detail: string
  ratio?: number
}
