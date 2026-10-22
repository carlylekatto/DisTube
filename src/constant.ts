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
} satisfies DisTubeOptions;
