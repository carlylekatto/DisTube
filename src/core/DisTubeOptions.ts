import { defaultOptions } from "../constant";
import { DisTubeError } from "../struct/DisTubeError";
import type {
  DisTubeOptions,
  DisTubePlugin,
  FFmpegArgs,
  FFmpegOptions,
  Filters,
  UnhandledErrorBehavior,
} from "../type";
import { checkInvalidKey } from "../util";

const UNHANDLED_ERROR_BEHAVIORS: readonly UnhandledErrorBehavior[] = ["log", "throw", "ignore"];

/**
 * The validated options of a {@link DisTube} instance.
 *
 * Every option has a default value, and every option is validated when the
 * instance is created.
 */
export class Options {
  /**
   * The plugins of the DisTube instance.
   */
  plugins: DisTubePlugin[];
  /**
   * Whether or not the {@link Events.PLAY_SONG} event is emitted when looping a
   * song or when the next song is the same as the previous one.
   * @default false
   */
  emitNewSongOnly: boolean;
  /**
   * Whether or not the previous songs of a {@link Queue} are saved.
   * @default true
   */
  savePreviousSongs: boolean;
  /**
   * The custom FFmpeg audio filters, that override the {@link defaultFilters}.
   */
  customFilters?: Filters;
  /**
   * Whether or not age-restricted content can be played in a non-NSFW channel.
   * @default false
   */
  nsfw: boolean;
  /**
   * Whether or not the {@link Events.ADD_SONG} event is emitted when a new
   * {@link Queue} is created.
   * @default true
   */
  emitAddSongWhenCreatingQueue: boolean;
  /**
   * Whether or not the {@link Events.ADD_LIST} event is emitted when a new
   * {@link Queue} is created.
   * @default true
   */
  emitAddListWhenCreatingQueue: boolean;
  /**
   * Whether or not the bot joins the new voice channel when
   * {@link DisTube#play} is used.
   * @default true
   */
  joinNewVoiceChannel: boolean;
  /**
   * The behavior of the {@link Events.ERROR} event when it has no listener.
   * @default "log"
   */
  unhandledError: UnhandledErrorBehavior;
  /**
   * The time (in milliseconds) a track may stay in the "buffering" state before
   * it is considered stuck and gets skipped.
   *
   * Set to `0` to disable the stuck-track detection.
   * @default 10000
   */
  stuckThreshold: number;
  /**
   * The FFmpeg options of the DisTube instance.
   */
  ffmpeg: FFmpegOptions;
  /**
   * Create the options of a {@link DisTube} instance.
   * @param options - The options given by the user
   * @throws {@link DisTubeError} When an option has an invalid type, or when it
   * is not a known option
   */
  constructor(options: DisTubeOptions) {
    if (typeof options !== "object" || Array.isArray(options)) {
      throw new DisTubeError("INVALID_TYPE", "object", options, "DisTubeOptions");
    }
    const opts = { ...defaultOptions, ...options };
    this.plugins = opts.plugins;
    this.emitNewSongOnly = opts.emitNewSongOnly;
    this.savePreviousSongs = opts.savePreviousSongs;
    this.customFilters = opts.customFilters;
    this.nsfw = opts.nsfw;
    this.emitAddSongWhenCreatingQueue = opts.emitAddSongWhenCreatingQueue;
    this.emitAddListWhenCreatingQueue = opts.emitAddListWhenCreatingQueue;
    this.joinNewVoiceChannel = opts.joinNewVoiceChannel;
    this.unhandledError = opts.unhandledError;
    this.stuckThreshold = opts.stuckThreshold;
    this.ffmpeg = this.#ffmpegOption(options);
    checkInvalidKey(opts, this, "DisTubeOptions");
    this.#validateOptions();
  }

  #validateOptions(options = this) {
    const booleanOptions = new Set([
      "emitNewSongOnly",
      "savePreviousSongs",
      "joinNewVoiceChannel",
      "nsfw",
      "emitAddSongWhenCreatingQueue",
      "emitAddListWhenCreatingQueue",
    ]);
    const numberOptions = new Set(["stuckThreshold"]);
    const stringOptions = new Set(["unhandledError"]);
    const objectOptions = new Set(["customFilters", "ffmpeg"]);
    const optionalOptions = new Set(["customFilters"]);

    for (const [key, value] of Object.entries(options)) {
      if (value === undefined && optionalOptions.has(key)) continue;
      if (key === "plugins" && !Array.isArray(value)) {
        throw new DisTubeError("INVALID_TYPE", "Array<Plugin>", value, `DisTubeOptions.${key}`);
      } else if (booleanOptions.has(key)) {
        if (typeof value !== "boolean") {
          throw new DisTubeError("INVALID_TYPE", "boolean", value, `DisTubeOptions.${key}`);
        }
      } else if (numberOptions.has(key)) {
        if (typeof value !== "number" || Number.isNaN(value)) {
          throw new DisTubeError("INVALID_TYPE", "number", value, `DisTubeOptions.${key}`);
        }
      } else if (stringOptions.has(key)) {
        if (typeof value !== "string") {
          throw new DisTubeError("INVALID_TYPE", "string", value, `DisTubeOptions.${key}`);
        }
        if (!UNHANDLED_ERROR_BEHAVIORS.includes(value as UnhandledErrorBehavior)) {
          throw new DisTubeError("INVALID_TYPE", UNHANDLED_ERROR_BEHAVIORS, value, `DisTubeOptions.${key}`);
        }
      } else if (objectOptions.has(key)) {
        if (typeof value !== "object" || Array.isArray(value)) {
          throw new DisTubeError("INVALID_TYPE", "object", value, `DisTubeOptions.${key}`);
        }
      }
    }
  }

  #ffmpegOption(opts: DisTubeOptions) {
    const args: FFmpegArgs = { global: {}, input: {}, output: {} };
    if (opts.ffmpeg?.args) {
      if (opts.ffmpeg.args.global) args.global = opts.ffmpeg.args.global;
      if (opts.ffmpeg.args.input) args.input = opts.ffmpeg.args.input;
      if (opts.ffmpeg.args.output) args.output = opts.ffmpeg.args.output;
    }
    const path = opts.ffmpeg?.path ?? "ffmpeg";
    if (typeof path !== "string") {
      throw new DisTubeError("INVALID_TYPE", "string", path, "DisTubeOptions.ffmpeg.path");
    }
    for (const [key, value] of Object.entries(args)) {
      if (typeof value !== "object" || Array.isArray(value)) {
        throw new DisTubeError("INVALID_TYPE", "object", value, `DisTubeOptions.ffmpeg.${key}`);
      }
      for (const [k, v] of Object.entries(value)) {
        if (
          typeof v !== "string" &&
          typeof v !== "number" &&
          typeof v !== "boolean" &&
          !Array.isArray(v) &&
          v !== null &&
          v !== undefined
        ) {
          throw new DisTubeError(
            "INVALID_TYPE",
            ["string", "number", "boolean", "Array<string | null | undefined>", "null", "undefined"],
            v,
            `DisTubeOptions.ffmpeg.${key}.${k}`,
          );
        }
      }
    }
    return { path, args };
  }
}
