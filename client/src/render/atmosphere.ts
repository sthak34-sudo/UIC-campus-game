/**
 * CPU port of the Preetham sky model used by three's `Sky` addon, plus the lighting quantities the
 * renderer derives from it (sun color/intensity, sky irradiance, fog colors, auto exposure).
 * Keeping it on the CPU means the light, the fog and the sky always agree, with no GPU read-back.
 * OWNER: Graphics Engineer.
 *
 * Light units: arbitrary "scene irradiance" units chosen so that a mid-October afternoon sun is
 * ~3 and the matching sky fill is ~0.6 (white paper in sun renders near-white at exposure ~1.5).
 * See LIGHT_UNITS for guidance to other modules (interior lights).
 */

export type RGB = [number, number, number];

export interface SkyParams {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
}

/** Slightly hazy Chicago autumn afternoon. */
export const DEFAULT_SKY: SkyParams = { turbidity: 4.2, rayleigh: 1.6, mieCoefficient: 0.0045, mieDirectionalG: 0.82 };

/** Global multiplier applied to the Preetham radiance so sky & sun share units (calibrated). */
export const SKY_SCALE = 0.1;
/** Direct-normal sun irradiance outside the atmosphere's extinction (scene units). */
export const SUN_SCALE = 3.5;
/** Preetham skies are too saturated for a hazy Chicago autumn; applied on CPU and in the sky shader. */
export const SKY_SATURATION = 0.62;
/** The environment (ambient light) uses an even less saturated sky so shadows read gray, not blue. */
export const ENV_SKY_SATURATION = 0.3;
/** Average ground albedo of a campus (asphalt, concrete, grass mix) used for bounce light. */
export const GROUND_ALBEDO = 0.2;

/**
 * Recommended light levels for other modules, in the same units as the sun.
 * Interiors are rendered with an exposure boost (INTERIOR_EXPOSURE_BOOST), the way an eye or camera adapts.
 */
export const LIGHT_UNITS = {
  /** Direct sun irradiance on a surface facing the sun, mid-October 2 pm. */
  sunAfternoon: 3.0,
  /** Target illuminance on desks/floors of a well-lit interior (office / library ~500 lux). */
  interiorTarget: 0.55,
  /** Corridors / stairs. */
  interiorDim: 0.25,
};
/** Fallback interior exposure boost when the image can't be metered (low quality preset). */
export const INTERIOR_EXPOSURE_BOOST = 1.8;

const E = 2.718281828459045;
const PI = Math.PI;
const totalRayleigh: RGB = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MieConst: RGB = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const cutoffAngle = 1.6110731556870734;
const steepness = 1.5;
const EE = 1000;
const rayleighZenithLength = 8.4e3;
const mieZenithLength = 1.25e3;

type V3 = [number, number, number];

/** Night-sky radiance floor: Chicago's orange city glow. */
export const NIGHT_FLOOR: RGB = [0.0034, 0.003, 0.0031];
/** Moonlight used as the key light at night. */
export const MOON_DIR: V3 = (() => {
  const el = (38 * Math.PI) / 180;
  const az = (150 * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
})();
export const MOON_COLOR: RGB = [0.72, 0.8, 1.0];
export const MOON_INTENSITY = 0.045;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

function sunIntensity(zenithAngleCos: number): number {
  const c = Math.min(1, Math.max(-1, zenithAngleCos));
  return EE * Math.max(0, 1 - Math.pow(E, -((cutoffAngle - Math.acos(c)) / steepness)));
}

function betas(p: SkyParams): { betaR: RGB; betaM: RGB } {
  const c = 0.2 * p.turbidity * 10e-18;
  const betaR = totalRayleigh.map((v) => v * p.rayleigh) as RGB;
  const betaM = MieConst.map((v) => 0.434 * c * v * p.mieCoefficient) as RGB;
  return { betaR, betaM };
}

function extinction(dirY: number, betaR: RGB, betaM: RGB): RGB {
  const zenithAngle = Math.acos(Math.max(0, dirY));
  const inv = 1 / (Math.cos(zenithAngle) + 0.15 * Math.pow(93.885 - (zenithAngle * 180) / PI, -1.253));
  const sR = rayleighZenithLength * inv;
  const sM = mieZenithLength * inv;
  return [0, 1, 2].map((i) => Math.exp(-(betaR[i] * sR + betaM[i] * sM))) as RGB;
}

/** Sky radiance in direction `dir` (unit, world, y up), sun disc excluded, in scene units. */
export function skyRadiance(dir: V3, sunDir: V3, p: SkyParams = DEFAULT_SKY): RGB {
  const { betaR, betaM } = betas(p);
  const sunE = sunIntensity(sunDir[1]);
  const Fex = extinction(dir[1], betaR, betaM);
  const cosTheta = dir[0] * sunDir[0] + dir[1] * sunDir[1] + dir[2] * sunDir[2];
  const rc = cosTheta * 0.5 + 0.5;
  const rPhase = (3 / (16 * PI)) * (1 + rc * rc);
  const g = p.mieDirectionalG;
  const mPhase = (1 / (4 * PI)) * ((1 - g * g) / Math.pow(1 - 2 * g * cosTheta + g * g, 1.5));
  const out: RGB = [0, 0, 0];
  const horizonMix = Math.min(1, Math.max(0, Math.pow(1 - sunDir[1], 5)));
  const floor: RGB = [0, 0.0003, 0.00075];
  for (let i = 0; i < 3; i++) {
    const ratio = (betaR[i] * rPhase + betaM[i] * mPhase) / (betaR[i] + betaM[i]);
    let Lin = Math.pow(sunE * ratio * (1 - Fex[i]), 1.5);
    Lin *= 1 + (Math.pow(sunE * ratio * Fex[i], 0.5) - 1) * horizonMix;
    const L0 = 0.1 * Fex[i];
    out[i] = ((Lin + L0) * 0.04 + floor[i]) * SKY_SCALE;
  }
  const l = lum(out);
  for (let i = 0; i < 3; i++) out[i] = l + (out[i] - l) * SKY_SATURATION;
  return out;
}

/** Fraction of sunlight reaching the ground (per channel) for a sun direction. */
export function sunTransmittance(sunDir: V3, p: SkyParams = DEFAULT_SKY): RGB {
  const { betaR, betaM } = betas(p);
  return extinction(sunDir[1], betaR, betaM);
}

export interface Lighting {
  /** Direction toward the key light: the sun, or the moon at night. */
  sunDir: V3;
  isMoon: boolean;
  /** Linear sun color (max channel 1). */
  sunColor: RGB;
  /** Direct-normal irradiance (scene units). */
  sunIntensity: number;
  /** Sky irradiance on an upward-facing surface (rgb, scene units). */
  skyIrradiance: RGB;
  /** Direct irradiance on an upward-facing surface (luminance). */
  directHorizontal: number;
  /** Total horizontal illuminance (luminance). */
  totalHorizontal: number;
  /** Radiance of the ground seen from above (used for bounce light in the environment map). */
  groundRadiance: RGB;
  /** Haze color looking along the horizon away from / toward the sun. */
  horizonColor: RGB;
  horizonSunColor: RGB;
  /** Suggested tone-mapping exposure for outdoors. */
  exposure: number;
}

/** Integrates the sky dome (cosine-weighted) and derives everything the renderer needs. */
export function computeLighting(sunDir: V3, p: SkyParams = DEFAULT_SKY): Lighting {
  // sky irradiance on a horizontal surface: E = ∫ L cosθ dω, midpoint rule in (θ, φ)
  const sky: RGB = [0, 0, 0];
  const NT = 12;
  const NP = 24;
  for (let i = 0; i < NT; i++) {
    const th = ((i + 0.5) / NT) * (PI / 2); // zenith angle
    const dTh = PI / 2 / NT;
    for (let j = 0; j < NP; j++) {
      const ph = ((j + 0.5) / NP) * 2 * PI;
      const d: V3 = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      const L = skyRadiance(d, sunDir, p);
      const w = Math.cos(th) * Math.sin(th) * dTh * ((2 * PI) / NP);
      sky[0] += L[0] * w;
      sky[1] += L[1] * w;
      sky[2] += L[2] * w;
    }
  }
  const T = sunTransmittance(sunDir, p);
  const el = Math.asin(Math.max(-1, Math.min(1, sunDir[1])));
  const elDeg = (el * 180) / PI;
  // fade the sun's disc out as it sets (smoothstep -1°..+2°)
  const fade = smoothstep(-1, 2, elDeg);
  const maxT = Math.max(T[0], T[1], T[2], 1e-6);
  // Preetham's extinction reddens the sun too much for a hazy-but-bright afternoon; soften it.
  let sunColor: RGB = [Math.pow(T[0] / maxT, 0.45), Math.pow(T[1] / maxT, 0.45), Math.pow(T[2] / maxT, 0.45)];
  let sunIntensityV = SUN_SCALE * maxT * fade;
  let keyDir: V3 = sunDir;
  const isMoon = sunIntensityV < 0.02;
  if (isMoon) {
    // night: the key light becomes a cool moon (fixed position), fading in through civil twilight
    keyDir = MOON_DIR;
    sunColor = [...MOON_COLOR];
    sunIntensityV = MOON_INTENSITY * smoothstep(0, -8, elDeg);
  }
  const directHorizontal = sunIntensityV * lum(sunColor) * Math.max(0, keyDir[1]);
  // city glow floor so nights are dark but never pitch black
  for (let i = 0; i < 3; i++) sky[i] += NIGHT_FLOOR[i] * PI;
  const skyL = lum(sky);
  const totalHorizontal = directHorizontal + skyL;
  const groundRadiance: RGB = [0, 1, 2].map(
    (i) => (GROUND_ALBEDO * (sunIntensityV * sunColor[i] * Math.max(0, keyDir[1]) + sky[i])) / PI,
  ) as RGB;
  // haze colors along the horizon (2° up)
  const sunH = Math.hypot(sunDir[0], sunDir[2]) || 1;
  const sx = sunDir[0] / sunH;
  const sz = sunDir[2] / sunH;
  const ce = Math.cos(2 * (PI / 180));
  const se = Math.sin(2 * (PI / 180));
  const away: RGB = [0, 0, 0];
  const N = 8;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * 2 * PI;
    const L = skyRadiance([Math.cos(a) * ce, se, Math.sin(a) * ce], sunDir, p);
    away[0] += L[0] / N;
    away[1] += L[1] / N;
    away[2] += L[2] / N;
  }
  const toward = skyRadiance([sx * ce, se, sz * ce], sunDir, p);
  for (let i = 0; i < 3; i++) {
    away[i] += NIGHT_FLOOR[i];
    toward[i] += NIGHT_FLOOR[i];
  }
  // Auto exposure: compress the huge day/dusk/night range (photographers' "keep the key a bit lower at dusk").
  // Meter on whichever is brighter: the ground, or a wall facing the sun (low golden-hour sun).
  const meter = Math.max(totalHorizontal, 0.45 * sunIntensityV * lum(sunColor) + skyL);
  const exposure = Math.min(14, Math.max(0.35, 2.9 / Math.pow(Math.max(meter, 1e-4), 0.72)));
  return {
    sunDir: keyDir,
    isMoon,
    sunColor,
    sunIntensity: sunIntensityV,
    skyIrradiance: sky,
    directHorizontal,
    totalHorizontal,
    groundRadiance,
    horizonColor: away,
    horizonSunColor: toward,
    exposure,
  };
}
