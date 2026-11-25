import type { DisTubeOptions, Filters } from "./type";

/**
 * The version of DisTube.
 *
 * The placeholder is replaced by the real version at build time.
 */
export const version: string = "[VI]{{inject}}[/VI]";

/**
 * The sample rate of the audio, in Hz.
 */
export const AUDIO_SAMPLE_RATE = 48000;
/**
 * The number of channels of the audio.
 */
export const AUDIO_CHANNELS = 2;

/**
 * Default volume percentage (0-100)
 */
export const DEFAULT_VOLUME = 50;

/**
 * The timeout to join a voice channel, in milliseconds.
 */
export const JOIN_TIMEOUT_MS = 30_000;
/**
 * The delay between two reconnection attempts, in milliseconds.
 */
export const RECONNECT_TIMEOUT_MS = 5_000;
/**
 * The maximum number of reconnection attempts before giving up.
 */
export const RECONNECT_MAX_ATTEMPTS = 5;

/**
 * Default time (in milliseconds) a track may stay in the "buffering" state
 * before it is considered stuck and gets skipped.
 */
export const STUCK_THRESHOLD_MS = 10_000;

/**
 * Default number of autoplay retry attempts when an autoplay item fails to resolve or stream.
 */
export const DEFAULT_AUTOPLAY_ATTEMPTS = 3;

/**
 * The number of candidates requested from a plugin when searching for a playable fallback.
 */
export const FALLBACK_CANDIDATES = 5;

/**
 * The duration tolerance in seconds when matching a song to its fallback candidate.
 */
export const DURATION_TOLERANCE_SECS = 5;

/**
 * The HTTP status codes that are followed as a redirection.
 */
export const HTTP_REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
/**
 * The maximum number of redirections that are followed before giving up.
 */
export const MAX_REDIRECT_DEPTH = 5;

/**
 * Default DisTube audio filters.
 */
export const defaultFilters: Filters = {
  "3d": "apulsator=hz=0.125",
  bassboost: "bass=g=10",
  echo: "aecho=0.8:0.9:1000:0.3",
  flanger: "flanger",
  gate: "agate",
  haas: "haas",
  karaoke: "stereotools=mlev=0.1",
  nightcore: "asetrate=48000*1.25,aresample=48000,bass=g=5",
  reverse: "areverse",
  vaporwave: "asetrate=48000*0.8,aresample=48000,atempo=1.1",
  mcompand: "mcompand",
  phaser: "aphaser",
  tremolo: "tremolo",
  surround: "surround",
  earwax: "earwax",
};

/**
 * Default number of seconds remaining in the currently playing song before preloading starts.
 */
export const DEFAULT_PRELOAD_THRESHOLD_SECS = 15;

/**
 * Default crossfade duration in seconds for a {@link Queue} (0 disables the crossfade).
 */
export const DEFAULT_CROSSFADE_DURATION_SECS = 0;
/**
 * Maximum crossfade duration in seconds a {@link Queue} may request.
 */
export const MAX_CROSSFADE_DURATION_SECS = 12;
/**
 * Default FFmpeg `acrossfade` fade curve of the crossfade transition.
 *
 * `qsin` is an equal-power curve: the two songs mix without the -3dB dip of a
 * linear (triangular) curve.
 */
export const DEFAULT_CROSSFADE_CURVE = "qsin";
/**
 * Default number of seconds before the fade window when the merged crossfade
 * transition stream is spawned to warm up its buffers.
 */
export const DEFAULT_CROSSFADE_WARMUP_SECS = 5;
/**
 * How far (in seconds) the playback position may drift past the expected
 * crossfade boundary before the transition is aborted and the regular
 * song-switch takes over.
 *
 * Swapping a transition stream in after the boundary replays the audio
 * between the boundary and the current position, so only a negligible late
 * drift is accepted.
 */
export const CROSSFADE_DRIFT_TOLERANCE_SECS = 0.75;
/**
 * How far (in seconds) before the boundary the media clock may be while still
 * counting as reached. Absorbs the 20ms media-clock step and the polling
 * interval, so a check that lands a frame early does not wait forever.
 */
export const CROSSFADE_SWAP_EPSILON_SECS = 0.05;
/**
 * How early (in milliseconds) the boundary timer is armed.
 *
 * `Queue#currentTime` follows the audio resource's media clock, while timers
 * run on the wall clock. Arming the timer slightly early guarantees that a
 * normal event-loop delay or a rounded song duration cannot make it fire
 * after the boundary (which would replay audio). The swap then waits for the
 * media clock to actually reach the boundary.
 */
export const CROSSFADE_BOUNDARY_LEAD_MS = 250;
/**
 * How far (in seconds) the playback position may lag the fade boundary and
 * still be recovered by waiting for the media clock.
 *
 * `Queue#currentTime` follows the audio resource's playback duration, while
 * the boundary timer is wall-clock based: initial buffering or a short network
 * stall makes the timer fire before the song actually reaches the boundary.
 * A small lag is harmless (the transition stream is already buffered), so the
 * swap waits for the media clock instead of aborting the crossfade.
 */
export const CROSSFADE_RESYNC_WINDOW_SECS = 3;
/**
 * How long the crossfade swap may wait for a lagging media clock before it
 * falls back to the regular song transition.
 */
export const CROSSFADE_RESYNC_TIMEOUT_MS = 4_000;
/**
 * How often the media clock is checked while a crossfade swap is catching up.
 */
export const CROSSFADE_RESYNC_INTERVAL_MS = 100;

/**
 * The default options of a {@link DisTube} instance.
 *
 * They are overridden by the options given to the constructor of
 * {@link DisTube}.
 */
export const defaultOptions = {
  plugins: [],
  emitNewSongOnly: false,
  savePreviousSongs: true,
  nsfw: false,
  emitAddSongWhenCreatingQueue: true,
  emitAddListWhenCreatingQueue: true,
  joinNewVoiceChannel: true,
  unhandledError: "log",
  stuckThreshold: STUCK_THRESHOLD_MS,
  autoplayAttempts: DEFAULT_AUTOPLAY_ATTEMPTS,
  preload: false,
  crossfade: {
    duration: DEFAULT_CROSSFADE_DURATION_SECS,
    curve: DEFAULT_CROSSFADE_CURVE,
    warmup: DEFAULT_CROSSFADE_WARMUP_SECS,
  },
} satisfies DisTubeOptions;
