declare module 'n8ao' {
  import type { Camera, Scene } from 'three';
  import { Pass } from 'postprocessing';

  /** N8AO pass for a pmndrs/postprocessing EffectComposer. Re-renders the scene itself. */
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    camera: Camera;
    /** When true, gamma follows whether this pass draws to the screen. We turn it off and tone-map later. */
    autosetGamma: boolean;
    autoDetectTransparency: boolean;
    configuration: {
      aoSamples: number;
      aoRadius: number;
      denoiseSamples: number;
      denoiseRadius: number;
      distanceFalloff: number;
      intensity: number;
      denoiseIterations: number;
      gammaCorrection: boolean;
      screenSpaceRadius: boolean;
      halfRes: boolean;
      colorMultiply: boolean;
      transparencyAware: boolean;
      autoRenderBeauty: boolean;
    };
  }
}
