/**
 * Atmospheric haze (aerial perspective). Replaces three's fog chunks globally with a physically
 * motivated height fog: exponential extinction that thins with altitude, and a haze color that
 * brightens/warms toward the sun (Mie scattering). Used with `scene.fog = new THREE.FogExp2(color, k)`,
 * where `k` is the extinction per meter at ground level.
 * OWNER: Graphics Engineer.
 */
import * as THREE from 'three';

/** Shared values; plain objects (not Vector3/Color) so three shares them by reference across materials. */
export const fogExtra = {
  fogSunDir: { value: { x: 0, y: 1, z: 0 } },
  fogSunColor: { value: { x: 0, y: 0, z: 0 } },
  /** 1 / scale height (m^-1). */
  fogHeightFalloff: { value: 1 / 420 },
};

let installed = false;

export function installHeightFog(): void {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  C.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
	varying vec3 vFogWorldPos;
#endif
`;
  C.fog_vertex = /* glsl */ `
#ifdef USE_FOG
	vFogWorldPos = ( vec4( mvPosition.xyz - viewMatrix[ 3 ].xyz, 0.0 ) * viewMatrix ).xyz;
#endif
`;
  C.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
	uniform vec3 fogColor;
	uniform vec3 fogSunDir;
	uniform vec3 fogSunColor;
	uniform float fogHeightFalloff;
	varying vec3 vFogWorldPos;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif
`;
  C.fog_fragment = /* glsl */ `
#ifdef USE_FOG
	vec3 fogRay = vFogWorldPos - cameraPosition;
	float fogDist = length( fogRay );
	vec3 fogDir = fogRay / max( fogDist, 1e-4 );
	#ifdef FOG_EXP2
		float fogK = max( fogHeightFalloff, 1e-6 );
		float fogH0 = max( cameraPosition.y, 0.0 );
		float fogDy = max( vFogWorldPos.y, 0.0 ) - fogH0;
		float fogInt = abs( fogDy ) > 0.5
			? ( exp( - fogK * fogH0 ) - exp( - fogK * ( fogH0 + fogDy ) ) ) / ( fogK * fogDy )
			: exp( - fogK * fogH0 );
		float fogFactor = 1.0 - exp( - fogDensity * fogDist * fogInt );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, fogDist );
	#endif
	float fogSunAmt = pow( max( dot( fogDir, fogSunDir ), 0.0 ), 5.0 );
	vec3 fogCol = fogColor;
	if ( fogSunColor.r + fogSunColor.g + fogSunColor.b > 0.0 ) fogCol = mix( fogColor, fogSunColor, fogSunAmt );
	#ifdef TONE_MAPPING
		fogCol = toneMapping( fogCol );
	#endif
	fogCol = linearToOutputTexel( vec4( fogCol, 1.0 ) ).rgb;
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif
`;
  // add the extra uniforms to every built-in material that has fog
  for (const lib of Object.values(THREE.ShaderLib) as { uniforms: Record<string, THREE.IUniform> }[]) {
    if (lib.uniforms && 'fogColor' in lib.uniforms) Object.assign(lib.uniforms, fogExtra);
  }
  Object.assign(THREE.UniformsLib.fog as Record<string, THREE.IUniform>, fogExtra);
}
