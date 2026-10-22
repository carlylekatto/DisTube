import { inspect } from "node:util";

/**
 * The table of the error messages of DisTube.
 *
 * Every entry is the message of one error code. A message can be a template
 * that receives the arguments of the error.
 */
const ERROR_MESSAGES = {
  /**
   * A value does not have the expected type.
   *
   * It is raised when an argument of a public method is not of the type that
   * the method expects, e.g. when a voice channel is not a voice channel.
   */
  INVALID_TYPE: (expected: (number | string) | readonly (number | string)[], got: any, name?: string) =>
    `Expected ${
      Array.isArray(expected) ? expected.map(e => (typeof e === "number" ? e : `'${e}'`)).join(" or ") : `'${expected}'`
    }${name ? ` for '${name}'` : ""}, but got ${inspect(got)} (${typeof got})`,
  /**
   * A number is not in the expected range.
   *
   * It is raised when a numeric argument is out of the range that the method
   * accepts, e.g. a negative volume.
   */
  NUMBER_COMPARE: (name: string, expected: string, value: number) => `'${name}' must be ${expected} ${value}`,
  /**
   * An array is empty.
   *
   * It is raised when an argument that must hold at least one element is
   * empty, e.g. the songs of a custom playlist.
   */
  EMPTY_ARRAY: (name: string) => `'${name}' is an empty array`,
  /**
   * An array does not have any valid element.
   *
   * It is raised when every element of an array was filtered out, e.g. when
   * all the songs of an array are invalid.
   */
  EMPTY_FILTERED_ARRAY: (name: string, type: string) => `There is no valid '${type}' in the '${name}' array`,
  /**
   * A string is empty.
   *
   * It is raised when a string argument that must not be empty is empty.
   */
  EMPTY_STRING: (name: string) => `'${name}' string must not be empty`,
  /**
   * An object has a key that is not allowed.
   *
   * It is raised when an options object has a key that DisTube does not know,
   * e.g. `{ emitNewSong: true }` instead of `{ emitNewSongOnly: true }`.
   */
  INVALID_KEY: (obj: string, key: string) => `'${key}' does not need to be provided in ${obj}`,
  /**
   * A required key is missing.
   *
   * It is raised when an object does not have a key that DisTube needs.
   */
  MISSING_KEY: (obj: string, key: string) => `'${key}' needs to be provided in ${obj}`,
  /**
   * Several required keys are missing.
   *
   * It is raised when an object does not have the keys that DisTube needs.
   */
  MISSING_KEYS: (obj: string, key: string[], all: boolean) =>
    `${key.map(k => `'${k}'`).join(all ? " and " : " or ")} need to be provided in ${obj}`,

  /**
   * The Discord.js client does not have the required intents.
   *
   * It is raised when the `GuildVoiceStates` intent is missing: DisTube
   * cannot work without it.
   */
  MISSING_INTENTS: (i: string) => `${i} intent must be provided for the Client`,
  /**
   * A DisTube option that is needed is disabled.
   *
   * It is raised when a feature cannot work because one of its options is
   * disabled, e.g. {@link Queue#previous} when
   * {@link DisTubeOptions.savePreviousSongs} is `false`.
   */
  DISABLED_OPTION: (o: string) => `DisTubeOptions.${o} is disabled`,
  /**
   * A DisTube option that must be disabled is enabled.
   *
   * It is raised when a feature cannot work because one of its options is
   * enabled.
   */
  ENABLED_OPTION: (o: string) => `DisTubeOptions.${o} is enabled`,

  /**
   * The user is not in any voice channel.
   *
   * It is raised when a command needs the voice channel of the user, but the
   * user is not connected to any voice channel.
   */
  NOT_IN_VOICE: "User is not in any voice channel",
  /**
   * The voice channel is full.
   *
   * It is raised when the bot cannot join a voice channel because it is
   * full.
   */
  VOICE_FULL: "The voice channel is full",
  /**
   * The guild already has a voice connection that DisTube does not manage.
   *
   * It is raised when DisTube cannot create a voice connection because
   * another one already exists in the guild.
   */
  VOICE_ALREADY_CREATED: "This guild already has a voice connection which is not managed by DisTube",
  /**
   * The voice connection could not be established in time.
   *
   * It is raised when the connection did not become ready before
   * {@link JOIN_TIMEOUT_MS}.
   */
  VOICE_CONNECT_FAILED: (s: number) => `Cannot connect to the voice channel after ${s} seconds`,
  /**
   * The bot does not have the permission to join the voice channel.
   *
   * It is raised when the bot cannot join a voice channel because of a missing
   * permission.
   */
  VOICE_MISSING_PERMS: "I do not have permission to join this voice channel",
  /**
   * The voice connection could not be restored.
   *
   * It is raised when every reconnection attempt of
   * {@link RECONNECT_MAX_ATTEMPTS} failed.
   */
  VOICE_RECONNECT_FAILED: "Cannot reconnect to the voice channel",
  /**
   * The voice channel belongs to another guild.
   *
   * It is raised when a voice connection is asked to join a voice channel of
   * another guild.
   */
  VOICE_DIFFERENT_GUILD: "Cannot join a voice channel in a different guild",
  /**
   * The voice channel belongs to another client.
   *
   * It is raised when a voice connection is asked to join a voice channel
   * that was created by another Discord.js client.
   */
  VOICE_DIFFERENT_CLIENT: "Cannot join a voice channel created by a different client",

  /**
   * The FFmpeg process exited with an unexpected code.
   *
   * It is raised when the FFmpeg process that decodes the audio exits with a
   * code that is neither `0` nor `255`.
   */
  FFMPEG_EXITED: (code: number) => `ffmpeg exited with code ${code}`,
  /**
   * FFmpeg is not installed at the given path.
   *
   * It is raised when the FFmpeg executable cannot be spawned, e.g. when
   * {@link DisTubeOptions.ffmpeg} points to a path that does not exist.
   */
  FFMPEG_NOT_INSTALLED: (path: string) => `ffmpeg is not installed at '${path}' path`,
  /**
   * No encryption library is available.
   *
   * It is raised when Discord cannot decrypt the audio: neither the
   * `aes-256-gcm` cipher of Node.js nor one of the supported third-party
   * encryption libraries is available.
   */
  ENCRYPTION_LIBRARIES_MISSING:
    "Cannot play audio as no valid encryption package is installed and your node doesn't support aes-256-gcm.\n" +
    "Please install  @noble/ciphers, @stablelib/xchacha20poly1305, sodium-native or libsodium-wrappers.",

  /**
   * The guild does not have a playing queue.
   *
   * It is raised when a queue operation is used in a guild that has no
   * {@link Queue}.
   */
  NO_QUEUE: "There is no playing queue in this guild",
  /**
   * The guild already has a queue.
   *
   * It is raised when a {@link Queue} is created for a guild that already
   * has one.
   */
  QUEUE_EXIST: "This guild has a Queue already",
  /**
   * The queue has been stopped already.
   *
   * It is raised when an operation needs a running queue, but the queue was
   * stopped.
   */
  QUEUE_STOPPED: "The queue has been stopped already",
  /**
   * The queue is already paused.
   *
   * It is raised when {@link Queue#pause} is used on a paused queue.
   */
  PAUSED: "The queue has been paused already",
  /**
   * The queue is already playing.
   *
   * It is raised when {@link Queue#resume} is used on a queue that is not
   * paused.
   */
  RESUMED: "The queue has been playing already",
  /**
   * The queue does not have any previous song.
   *
   * It is raised when {@link Queue#previous} is used on a queue without any
   * history.
   */
  NO_PREVIOUS: "There is no previous song in this queue",
  /**
   * The queue does not have any up next song.
   *
   * It is raised when a jump goes past the end of the queue while the
   * autoplay mode is disabled.
   */
  NO_UP_NEXT: "There is no up next song",
  /**
   * The queue does not have any song at the given position.
   *
   * It is raised when {@link Queue#jump} is used with a position that is out
   * of the bounds of the queue.
   */
  NO_SONG_POSITION: "Does not have any song at this position",
  /**
   * The queue does not have any playing song.
   *
   * It is raised when a related song is requested but the queue is empty.
   */
  NO_PLAYING_SONG: "There is no playing song in the queue",
  /**
   * The track is stuck and does not produce any audio.
   *
   * It is raised when a track stays in the "buffering" state for longer than
   * {@link DisTubeOptions.stuckThreshold} milliseconds. The queue skips it.
   */
  TRACK_STUCK: "The track is stuck and not producing any audio",
  /**
   * There is no extractor plugin.
   *
   * It is raised when a search is requested but no {@link ExtractorPlugin} is
   * registered in {@link DisTubeOptions.plugins}.
   */
  NO_EXTRACTOR_PLUGIN: "There is no extractor plugin in the DisTubeOptions.plugins, please add one for searching songs",
  /**
   * No related song could be found.
   *
   * It is raised when the autoplay mode is enabled and no plugin could find
   * a related song for the current one.
   */
  NO_RELATED: "Cannot find any related songs",
  /**
   * The related song cannot be played.
   *
   * It is raised when the related song of the autoplay mode cannot be
   * played.
   */
  CANNOT_PLAY_RELATED: "Cannot play the related song",
  /**
   * The video is unavailable.
   *
   * It is raised when the source of the song does not have the video anymore,
   * e.g. when it was removed or when it is private.
   */
  UNAVAILABLE_VIDEO: "This video is unavailable",
  /**
   * No playable format was found.
   *
   * It is raised when the source of the song does not have any format that
   * FFmpeg can play.
   */
  UNPLAYABLE_FORMATS: "No playable format found",
  /**
   * The content is age-restricted and cannot be played in this channel.
   *
   * It is raised when an age-restricted song is played in a non-NSFW channel
   * while {@link DisTubeOptions.nsfw} is `false`.
   */
  NON_NSFW: "Cannot play age-restricted content in non-NSFW channel",
  /**
   * The url is not supported.
   *
   * It is raised when no plugin of {@link DisTubeOptions.plugins} can handle
   * the url.
   */
  NOT_SUPPORTED_URL: "This url is not supported",
  /**
   * No plugin supports the song.
   *
   * It is raised when no plugin of {@link DisTubeOptions.plugins} can play
   * the song.
   */
  NOT_SUPPORTED_SONG: (song: string) => `There is no plugin supporting this song (${song})`,
  /**
   * The array does not have any valid song.
   *
   * It is raised when every element of the `songs` array of
   * {@link DisTube#createCustomPlaylist} is neither a {@link Song} nor a
   * valid url.
   */
  NO_VALID_SONG: "'songs' array does not have any valid Song or url",
  /**
   * The input cannot be resolved to a song or a playlist.
   *
   * It is raised when the input of {@link DisTubeHandler#resolve} is neither
   * a url, nor a {@link Song}, nor a {@link Playlist}.
   */
  CANNOT_RESOLVE_SONG: (t: any) => `Cannot resolve ${inspect(t)} to a Song`,
  /**
   * The stream url of the song cannot be found.
   *
   * It is raised when the plugin of the song does not return a stream url.
   */
  CANNOT_GET_STREAM_URL: (song: string) => `Cannot get stream url with this song (${song})`,
  /**
   * The search query of the song cannot be built.
   *
   * It is raised when the plugin of the song cannot build a query to look for
   * a playable version of it.
   */
  CANNOT_GET_SEARCH_QUERY: (song: string) => `Cannot get search query with this song (${song})`,
  /**
   * No song was found for the query.
   *
   * It is raised when no plugin of {@link DisTubeOptions.plugins} has any
   * result for the search query.
   */
  NO_RESULT: (query: string) => `Cannot find any song with this query (${query})`,
  /**
   * The song does not have any stream url.
   *
   * It is raised when a song is played while it does not have a stream url
   * attached to it.
   */
  NO_STREAM_URL: (song: string) => `No stream url attached (${song})`,

  /**
   * Every video of the playlist was filtered out.
   *
   * It is raised when a playlist does not have any valid video left, e.g.
   * because all of them were age-restricted and the channel is not NSFW.
   */
  EMPTY_FILTERED_PLAYLIST:
    "There is no valid video in the playlist\n" +
    "Maybe age-restricted contents is filtered because you are in non-NSFW channel",
  /**
   * The playlist does not have any valid video.
   *
   * It is raised when a playlist is empty.
   */
  EMPTY_PLAYLIST: "There is no valid video in the playlist",
};

type ErrorMessage = typeof ERROR_MESSAGES;
type ErrorCode = keyof ErrorMessage;
type StaticErrorCode = { [K in ErrorCode]-?: ErrorMessage[K] extends string ? K : never }[ErrorCode];
type TemplateErrorCode = Exclude<keyof typeof ERROR_MESSAGES, StaticErrorCode>;

const haveCode = (code: string): code is ErrorCode => Object.keys(ERROR_MESSAGES).includes(code);
const parseMessage = (m: string | ((...x: any) => string), ...args: any) => (typeof m === "string" ? m : m(...args));
const getErrorMessage = (code: string, ...args: any): string => {
  if (!haveCode(code)) return args[0];
  try {
    return parseMessage(ERROR_MESSAGES[code], ...args);
  } catch {
    // The error code needs more arguments than the ones that were given.
    return args[0] ?? code;
  }
};

/**
 * The error raised by DisTube.
 *
 * Every error of the library is a `DisTubeError`: it has a machine readable
 * `errorCode` and a human readable message that is built from the code.
 *
 * @example
 * ```ts
 * try {
 *   await distube.play(channel, "Never gonna give you up");
 * } catch (error) {
 *   if (error instanceof DisTubeError && error.errorCode === "NO_RESULT") {
 *     // No song was found for the query.
 *   }
 * }
 * ```
 */
export class DisTubeError<T extends string = any> extends Error {
  /**
   * The code of the error, e.g. `NO_RESULT`.
   */
  errorCode: string;
  /**
   * Create a DisTube error with a static error code.
   * @param code - The code of the error
   */
  constructor(code: T extends StaticErrorCode ? T : never);
  /**
   * Create a DisTube error with a templated error code.
   * @param code - The code of the error
   * @param args - The arguments of the message template of the code
   */
  constructor(code: T extends TemplateErrorCode ? T : never, ...args: Parameters<ErrorMessage[typeof code]>);
  /**
   * Create a DisTube error with a templated error code.
   * @param code - The code of the error
   * @param _    - Not used: it prevents this overload from being selected
   */
  constructor(code: TemplateErrorCode, _: never);
  /**
   * Create a DisTube error with a custom message.
   * @param code    - The code of the error
   * @param message - The custom message of the error
   */
  constructor(code: T extends ErrorCode ? never : T, message: string);
  /**
   * Create a DisTube error.
   * @param code - The code of the error
   * @param args - The arguments of the message template of the code
   */
  constructor(code: string, ...args: any) {
    super(getErrorMessage(code, ...args));

    this.errorCode = code;
    if (Error.captureStackTrace) Error.captureStackTrace(this, DisTubeError);
  }

  /**
   * Create a {@link DisTubeError} with a custom message.
   *
   * The default message of an error code is a generic template. Use this factory
   * when you need to tell the user what exactly went wrong, or when you want to
   * keep the original error as the `cause` of the error.
   *
   * It is polymorphic: calling it on a subclass creates an instance of that
   * subclass.
   *
   * @param code    - The error code
   * @param message - The custom message
   * @param options - Optional options
   * @param options.cause - The original error that caused this one
   * @returns The created error
   */
  static withMessage<T extends string = any>(code: T, message: string, options?: { cause?: unknown }): DisTubeError<T> {
    // biome-ignore lint/complexity/noThisInStatic: the factory has to create an instance of the class it is called on
    const error = new (this as any)(code, message) as DisTubeError<T>;
    error.message = message;
    if (options && "cause" in options) error.cause = options.cause;
    return error;
  }

  /**
   * The name of the error, with its code.
   * @returns The name of the error, e.g. `DisTubeError [NO_RESULT]`
   */
  override get name() {
    return `DisTubeError [${this.errorCode}]`;
  }

  /**
   * The code of the error, e.g. `NO_RESULT`.
   *
   * It is an alias of {@link DisTubeError.errorCode}.
   * @returns The code of the error
   */
  get code() {
    return this.errorCode;
  }
}
