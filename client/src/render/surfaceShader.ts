/**
 * Shader extensions injected into three's standard/physical materials (onBeforeCompile).
 * OWNER: Graphics Engineer.
 *
 * - World-space macro variation: large & medium blotches sampled in world space, so tiling
 *   textures never repeat visibly and adjacent buildings never look identical.
 * - Weathering (exterior walls): vertical rain streaks, darker splash zone at the base,
 *   grime on up-facing ledges. Works without any special UVs: everything is derived from the
 *   world position + world normal (walls: "along-the-wall" coordinate × height).
 * - Anti-tiling: a second, rotated & scaled albedo sample blended by world noise (ground cover).
 * - Glass "interior mapping": opaque window glass shows fake rooms (floor, ceiling lights, walls,
 *   blinds) at the right parallax behind the pane, plus real reflections. No geometry needed.
 * - Clear glass blending: reflections are not faded by the glass's opacity.
 */
import * as THREE from 'three';

export interface SurfaceFx {
  /** Meters covered by one copy of the macro noise texture. */
  macroScale?: number;
  /** Albedo +/- from large blotches and medium blotches. */
  macroAmp?: number;
  macroAmp2?: number;
  /** Roughness +/- from medium blotches. */
  roughAmp?: number;
  /** Rain-streak darkening on vertical faces (0-1). */
  streaks?: number;
  /** Darkening of the bottom ~0.6 m of vertical faces (splash zone). */
  baseGrime?: number;
  /** Darkening of up-facing surfaces (ledges, sills). */
  topDirt?: number;
  /** Blend a rotated second sample of the albedo to hide tiling (ground cover). */
  antiTile?: boolean;
  /** Like antiTile but with a pure offset (in texture tiles), for patterns that must stay aligned (board-form rows). */
  antiTileShift?: [number, number];
  /** Patchy straw-colored areas (lawns in October). */
  dryTint?: number;
  /** Fake rooms behind opaque window glass. */
  interior?: boolean;
  /** Color the rooms are seen through (glass body tint). Default: slightly green clear glass. */
  glassTint?: [number, number, number];
  /** How much of the room shows through (fritted glass hides part of it). Default 1. */
  interiorScale?: number;
  /** Transparent glass: keep full-strength reflections regardless of opacity. */
  clearGlass?: boolean;
}

/** Shared uniforms (same objects in every program, so updating them updates all materials). */
export const surfaceUniforms = {
  gfxMacro: { value: null as THREE.Texture | null },
  gfxTime: { value: 0 },
  /** x: daylight level inside rooms (seen through windows), y: electric light level. */
  gfxInterior: { value: new THREE.Vector2(0.05, 0.02) },
};


export function applySurfaceFx(mat: THREE.MeshStandardMaterial, fx: SurfaceFx, _key?: string): void {
  // Only feature switches are #defines; every tuning number is a per-material uniform. Materials
  // with the same switches therefore share one shader program (cache key = switch list) instead
  // of compiling one program per material name.
  const flags: string[] = [];
  if (fx.streaks || fx.baseGrime || fx.topDirt) flags.push('GFX_WEATHER');
  if (fx.antiTile) flags.push('GFX_ANTITILE');
  if (fx.antiTileShift) flags.push('GFX_ANTITILE_SHIFT_ON');
  if (fx.dryTint) flags.push('GFX_DRY_ON');
  if (fx.interior) flags.push('GFX_INTERIOR');
  if (fx.clearGlass) flags.push('GFX_CLEAR_GLASS');
  const gt = fx.glassTint ?? [0.72, 0.8, 0.78];
  const sc = fx.interiorScale ?? 1;
  const gfxP = {
    value: [
      new THREE.Vector4(fx.macroScale ?? 41, fx.macroAmp ?? 0, fx.macroAmp2 ?? 0, fx.roughAmp ?? 0),
      new THREE.Vector4(fx.streaks ?? 0, fx.baseGrime ?? 0, fx.topDirt ?? 0, fx.dryTint ?? 0),
      new THREE.Vector4(fx.antiTileShift?.[0] ?? 0, fx.antiTileShift?.[1] ?? 0, 0, 0),
      new THREE.Vector4(gt[0] * sc, gt[1] * sc, gt[2] * sc, 0),
    ],
  };
  const header = [
    ...flags.map((d) => `#define ${d}`),
    '#ifdef GFX_ANTITILE_SHIFT_ON\n#define GFX_ANTITILE_SHIFT gfxP[ 2 ].xy\n#endif',
    '#ifdef GFX_DRY_ON\n#define GFX_DRY gfxP[ 1 ].w\n#endif',
    'uniform vec4 gfxP[ 4 ];',
    '#define GFX_MACRO_SCALE gfxP[ 0 ].x',
    '#define GFX_MACRO_AMP gfxP[ 0 ].y',
    '#define GFX_MACRO_AMP2 gfxP[ 0 ].z',
    '#define GFX_ROUGH_AMP gfxP[ 0 ].w',
    '#define GFX_STREAKS gfxP[ 1 ].x',
    '#define GFX_BASE gfxP[ 1 ].y',
    '#define GFX_TOP gfxP[ 1 ].z',
    '#define GFX_GLASS_TINT gfxP[ 3 ].xyz',
  ].join('\n');
  const cacheKey = `gfx:${flags.join(',')}`;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.gfxMacro = surfaceUniforms.gfxMacro;
    shader.uniforms.gfxTime = surfaceUniforms.gfxTime;
    shader.uniforms.gfxInterior = surfaceUniforms.gfxInterior;
    shader.uniforms.gfxP = gfxP;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGfxWPos;\nvarying vec3 vGfxWNrm;`)
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vGfxWPos = ( vec4( mvPosition.xyz - viewMatrix[ 3 ].xyz, 0.0 ) * viewMatrix ).xyz;
        vGfxWNrm = ( vec4( transformedNormal, 0.0 ) * viewMatrix ).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${header}\n${FRAG_PARS}`)
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor + GFX_ROUGH_AMP * ( gfxMac2.g * 2.0 - 1.0 ), 0.03, 1.0 );')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_INTERIOR}`);
    if (fx.clearGlass) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <opaque_fragment>', 'gl_FragColor = vec4( totalDiffuse * diffuseColor.a + totalSpecular + totalEmissiveRadiance, diffuseColor.a );')
        .replace('#include <premultiplied_alpha_fragment>', '');
    }
  };
  mat.customProgramCacheKey = () => cacheKey;
  mat.userData.gfxP = gfxP;
}

const FRAG_PARS = /* glsl */ `
uniform sampler2D gfxMacro;
uniform float gfxTime;
uniform vec2 gfxInterior;
varying vec3 vGfxWPos;
varying vec3 vGfxWNrm;
float gfxHash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
`;

const FRAG_MAP = /* glsl */ `
vec3 gfxN = normalize( vGfxWNrm );
float gfxVert = 1.0 - smoothstep( 0.35, 0.7, abs( gfxN.y ) );
vec2 gfxT = vec2( -gfxN.z, gfxN.x );
float gfxTl = length( gfxT );
gfxT = gfxTl > 1e-3 ? gfxT / gfxTl : vec2( 1.0, 0.0 );
float gfxH = dot( vGfxWPos.xz, gfxT );
vec2 gfxMuv = gfxVert > 0.5 ? vec2( gfxH, vGfxWPos.y ) : vGfxWPos.xz;
vec3 gfxMac = texture2D( gfxMacro, gfxMuv / GFX_MACRO_SCALE ).rgb;
vec3 gfxMac2 = texture2D( gfxMacro, gfxMuv / ( GFX_MACRO_SCALE * 0.21 ) + vec2( 0.37, 0.71 ) ).rgb;
#if defined( GFX_ANTITILE ) && defined( USE_MAP )
	vec4 gfxA = texture2D( map, vMapUv );
	vec2 gfxUvB = mat2( 0.8, 0.6, -0.6, 0.8 ) * vMapUv * 0.71 + vec2( 0.31, 0.57 );
	vec4 gfxB = texture2D( map, gfxUvB );
	diffuseColor *= mix( gfxA, gfxB, smoothstep( 0.38, 0.62, gfxMac2.b ) );
#elif defined( GFX_ANTITILE_SHIFT ) && defined( USE_MAP )
	vec4 gfxA = texture2D( map, vMapUv );
	vec4 gfxB = texture2D( map, vMapUv + GFX_ANTITILE_SHIFT );
	diffuseColor *= mix( gfxA, gfxB, smoothstep( 0.35, 0.65, gfxMac2.b ) );
#else
	#include <map_fragment>
#endif
diffuseColor.rgb *= ( 1.0 + GFX_MACRO_AMP * ( gfxMac.r * 2.0 - 1.0 ) ) * ( 1.0 + GFX_MACRO_AMP2 * ( gfxMac2.g * 2.0 - 1.0 ) );
#ifdef GFX_DRY
	diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.5, 1.12, 0.6 ), GFX_DRY * smoothstep( 0.42, 0.85, gfxMac.g ) );
#endif
#ifdef GFX_WEATHER
	// rain streaks: fine noise stretched ~30x vertically, gated by medium noise so they cluster
	float gfxSt = texture2D( gfxMacro, vec2( gfxH * 0.23, vGfxWPos.y * 0.009 ) ).g;
	float gfxStreak = smoothstep( 0.52, 0.85, gfxSt ) * ( 0.5 + 0.5 * smoothstep( 0.3, 0.7, gfxMac2.r ) );
	diffuseColor.rgb *= 1.0 - GFX_STREAKS * gfxStreak * gfxVert;
	// broad, storey-tall run-off stains: what makes a weathered facade read as such from far away
	float gfxBig = texture2D( gfxMacro, vec2( gfxH * 0.045, vGfxWPos.y * 0.0025 ) + vec2( 0.13, 0.0 ) ).g;
	diffuseColor.rgb *= 1.0 - GFX_STREAKS * 0.9 * smoothstep( 0.42, 0.8, gfxBig ) * gfxVert;
	float gfxBase = exp( - max( vGfxWPos.y, 0.0 ) / 0.55 ) * ( 0.65 + 0.35 * gfxMac2.b );
	diffuseColor.rgb *= 1.0 - GFX_BASE * gfxBase * gfxVert;
	diffuseColor.rgb *= 1.0 - GFX_TOP * smoothstep( 0.6, 0.95, gfxN.y ) * ( 0.6 + 0.4 * gfxMac2.g );
#endif
`;

// Fake rooms behind opaque glass. Room grid: 4.5 m bays, 3.9 m floors, 5 m deep.
const FRAG_INTERIOR = /* glsl */ `
#ifdef GFX_INTERIOR
{
	vec3 gV = normalize( vGfxWPos - cameraPosition );
	vec3 gT = vec3( gfxT.x, 0.0, gfxT.y );
	vec3 gD = - gfxN;
	vec3 r = vec3( dot( gV, gT ), gV.y, max( dot( gV, gD ), 1e-3 ) );
	vec2 cell = vec2( 4.5, 3.9 );
	vec2 lp = vec2( gfxH, vGfxWPos.y - 0.3 ) / cell;
	vec2 id = floor( lp );
	vec2 fr = lp - id;
	float rnd = gfxHash( id + floor( vGfxWPos.xz / 97.0 ) );
	float rnd2 = gfxHash( id * 1.7 + 3.1 );
	float tx = r.x > 0.0 ? ( 1.0 - fr.x ) * cell.x / r.x : fr.x * cell.x / max( - r.x, 1e-4 );
	float ty = r.y > 0.0 ? ( 1.0 - fr.y ) * cell.y / r.y : fr.y * cell.y / max( - r.y, 1e-4 );
	float tz = ( 4.0 + rnd2 * 3.0 ) / r.z;
	float t = min( tx, min( ty, tz ) );
	vec3 hit = vec3( fr * cell, 0.0 ) + r * t;
	float lightsOn = step( 0.35, rnd );
	vec3 col;
	if ( t == ty && r.y > 0.0 ) {
		vec2 pp = fract( vec2( hit.x / 2.25, hit.z / 1.8 ) );
		float panel = step( 0.3, pp.x ) * step( pp.x, 0.7 ) * step( 0.35, pp.y ) * step( pp.y, 0.65 );
		col = vec3( 0.72 ) * gfxInterior.x * 0.6 + vec3( 1.0, 0.97, 0.9 ) * panel * lightsOn * gfxInterior.y * 9.0;
	} else if ( t == ty ) {
		col = mix( vec3( 0.09, 0.09, 0.1 ), vec3( 0.25, 0.2, 0.15 ), rnd2 ) * gfxInterior.x * 1.4;
	} else if ( t == tz ) {
		col = mix( vec3( 0.55, 0.53, 0.5 ), vec3( 0.45, 0.5, 0.55 ), rnd ) * gfxInterior.x * 0.7;
	} else {
		col = vec3( 0.6, 0.58, 0.55 ) * gfxInterior.x;
	}
	// daylight falls off away from the window; electric light is even
	col *= 0.3 + 0.7 * exp( - hit.z * 0.35 );
	col += vec3( 0.55, 0.53, 0.5 ) * lightsOn * gfxInterior.y * ( t == ty && r.y > 0.0 ? 0.0 : 1.0 );
	// blinds hanging from the window head, random height per room
	float blindLevel = fract( rnd * 7.31 ) < 0.55 ? fract( rnd2 * 5.17 ) * 0.55 : 0.0;
	float blind = step( 1.0 - blindLevel, fr.y );
	float slat = 0.85 + 0.15 * step( 0.5, fract( vGfxWPos.y * 20.0 ) );
	col = mix( col, vec3( 0.72, 0.7, 0.64 ) * slat * ( gfxInterior.x * 1.5 + gfxInterior.y * lightsOn ), blind );
	float cosV = clamp( dot( - gV, gfxN ), 0.0, 1.0 );
	float fres = 0.07 + 0.93 * pow( 1.0 - cosV, 5.0 );
	totalEmissiveRadiance += col * GFX_GLASS_TINT * ( 1.0 - fres );
}
#endif
`;
