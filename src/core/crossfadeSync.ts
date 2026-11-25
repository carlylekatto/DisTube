import {
  CROSSFADE_DRIFT_TOLERANCE_SECS,
  CROSSFADE_RESYNC_INTERVAL_MS,
  CROSSFADE_RESYNC_WINDOW_SECS,
  CROSSFADE_SWAP_EPSILON_SECS,
} from "../constant";

/**
 * What to do when the crossfade transition is about to replace the playing
 * stream.
 */
export type CrossfadeSyncDecision =
  | { action: "swap" }
  | { action: "wait"; waitMs: number }
  | { action: "abort"; reason: "invalid" | "late" | "stalled" };

/**
 * Decide whether the media clock has reached the crossfade boundary.
 *
 * The transition stream starts at the fade boundary, so the swap has to
 * happen when the media reaches that point:
 *
 * - swapping before it skips the audio in between,
 * - swapping after it replays the audio in between.
 *
 * `Queue#currentTime` follows the audio resource's media clock (one 20ms step
 * per played packet), while the boundary timer runs on the wall clock. The
 * timer is armed slightly early, so a check normally lands just before the
 * boundary and has to wait for the clock. A larger lag means initial
 * buffering or a network stall; waiting is still safe because the transition
 * stream is already buffered, up to the resync deadline.
 *
 * A late timer cannot be recovered: the audio between the boundary and the
 * current position has already played, so the regular song transition is the
 * safer fallback.
 *
 * @param currentTime - Current media time in seconds
 * @param boundary - Media time of the fade boundary in seconds
 * @param now - Current wall-clock time in milliseconds
 * @param deadline - Wall-clock deadline for the resync wait in milliseconds
 */
export function resolveCrossfadeSync(
  currentTime: number,
  boundary: number,
  now: number,
  deadline: number,
): CrossfadeSyncDecision {
  if (!Number.isFinite(currentTime) || !Number.isFinite(boundary)) return { action: "abort", reason: "invalid" };
  const drift = currentTime - boundary;
  if (drift >= -CROSSFADE_SWAP_EPSILON_SECS) {
    return drift <= CROSSFADE_DRIFT_TOLERANCE_SECS ? { action: "swap" } : { action: "abort", reason: "late" };
  }
  if (drift >= -CROSSFADE_RESYNC_WINDOW_SECS && now < deadline) {
    return {
      action: "wait",
      waitMs: Math.min(CROSSFADE_RESYNC_INTERVAL_MS, Math.max(1, -drift * 1000)),
    };
  }
  return { action: "abort", reason: "stalled" };
}
