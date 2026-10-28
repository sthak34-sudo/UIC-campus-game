/**
 * Extra soft sky fill for shaded spots (under entrance canopies, arcades, building shadows) on the
 * low quality tier. Low has no ambient occlusion, bloom or interior metering, so shade there reads
 * much darker than on medium/high. This lifts it a little through the existing hemisphere fill
 * light (no new lights, so no shader recompiles and no extra per-pixel cost). The sun, sky and
 * the shadow-side combat fill stay as they are.
 */
export const SHADE_FILL = {
  /** Hemisphere fill outdoors in full daylight on the low tier. */
  lowTierOutdoor: 0.3,
  /** Same on tiers with post-processing (AO and metering already handle shade). */
  postTierOutdoor: 0,
  /** Low tier indoors without metering: multiply the fixed room fill by this. */
  lowTierRoomFill: 1.6,
};

/**
 * Hemisphere fill intensity for the non-room path. `daylight` 0..1 (sky strength), `insideAmt` 0..1.
 * Indoors keeps the original 0.25 × insideAmt × daylight interior fill.
 */
export function hemisphereFill(post: boolean, insideAmt: number, daylight: number): number {
  const d = Math.max(0, Math.min(1, daylight));
  const indoor = 0.25 * insideAmt * d;
  const outdoor = (post ? SHADE_FILL.postTierOutdoor : SHADE_FILL.lowTierOutdoor) * (1 - insideAmt) * d;
  return indoor + outdoor;
}
