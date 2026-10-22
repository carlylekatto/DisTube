import type {
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  Interaction,
  Message,
  Snowflake,
  VoiceBasedChannel,
  VoiceState,
} from "discord.js";
import type {
  DisTubeError,
  DisTubeVoice,
  ExtractorPlugin,
  InfoExtractorPlugin,
  PlayableExtractorPlugin,
  Playlist,
  Queue,
  Song,
} from ".";

/**
 * A value that can be awaited.
 *
 * It is used by every method of DisTube that can be implemented
 * synchronously or asynchronously: the plugin methods and the event
 * listeners.
 */
export type Awaitable<T = any> = T | PromiseLike<T>;

/**
 * Behavior when the {@link Events.ERROR} event is emitted but nobody listens to it.
 * - `log` (default): the error is logged to the console instead of crashing the process
 * - `throw`: the error is re-thrown (Node.js default behavior)
 * - `ignore`: the error is silently discarded
 */
export type UnhandledErrorBehavior = "log" | "throw" | "ignore";

/**
 * The events emitted by a {@link DisTube} instance.
 */
export enum Events {
  /**
   * Emitted when DisTube encounters an error while playing songs.
   *
   * It is the only special event: Node.js crashes the process when the
   * `"error"` event is emitted without any listener. DisTube handles it
   * gracefully instead, following {@link DisTubeOptions.unhandledError}.
   */
  ERROR = "error",
  /**
   * Emitted after a new playlist is added to a {@link Queue}.
   */
  ADD_LIST = "addList",
  /**
   * Emitted after a new song is added to a {@link Queue}.
   */
  ADD_SONG = "addSong",
  /**
   * Emitted when a song starts playing.
   */
  PLAY_SONG = "playSong",
  /**
   * Emitted when a song finished playing.
   */
  FINISH_SONG = "finishSong",
  /**
   * Emitted when a {@link Queue} runs out of songs to play.
   */
  EMPTY = "empty",
  /**
   * Emitted when a {@link Queue} is finished, and its autoplay mode is
   * disabled.
   */
  FINISH = "finish",
  /**
   * Emitted when a {@link Queue} is initialized, to change its default
   * properties.
   */
  INIT_QUEUE = "initQueue",
  /**
   * Emitted when the autoplay mode is enabled and no related song could be
   * found.
   */
  NO_RELATED = "noRelated",
  /**
   * Emitted when the bot is disconnected from a voice channel.
   */
  DISCONNECT = "disconnect",
  /**
   * Emitted when a {@link Queue} is deleted.
   */
  DELETE_QUEUE = "deleteQueue",
  /**
   * Emitted for logging FFmpeg debug information.
   */
  FFMPEG_DEBUG = "ffmpegDebug",
  /**
   * Emitted to provide debug information from DisTube's operation.
   */
  DEBUG = "debug",
}

/**
 * The arguments of every {@link Events} event.
 *
 * It is the source of truth of the signature of the event listeners:
 * @see {@link TypedDisTubeEvents}
 */
export type DisTubeEvents = {
  /**
   * Emitted after a new playlist is added to a {@link Queue}.
   */
  [Events.ADD_LIST]: [queue: Queue, playlist: Playlist];
  /**
   * Emitted after a new song is added to a {@link Queue}.
   */
  [Events.ADD_SONG]: [queue: Queue, song: Song];
  /**
   * Emitted when a {@link Queue} is deleted.
   */
  [Events.DELETE_QUEUE]: [queue: Queue];
  /**
   * Emitted when the bot is disconnected from a voice channel.
   */
  [Events.DISCONNECT]: [queue: Queue];
  /**
   * Emitted when a {@link Queue} runs out of songs to play.
   */
  [Events.EMPTY]: [queue: Queue];
  /**
   * Emitted when DisTube encounters an error while playing songs.
   */
  [Events.ERROR]: [error: Error, queue: Queue, song: Song | undefined];
  /**
   * Emitted for logging FFmpeg debug information.
   */
  [Events.FFMPEG_DEBUG]: [debug: string];
  /**
   * Emitted to provide debug information from DisTube's operation.
   */
  [Events.DEBUG]: [debug: string];
  /**
   * Emitted when a {@link Queue} is finished, and its autoplay mode is
   * disabled.
   */
  [Events.FINISH]: [queue: Queue];
  /**
   * Emitted when a song finished playing.
   */
  [Events.FINISH_SONG]: [queue: Queue, song: Song];
  /**
   * Emitted when a {@link Queue} is initialized.
   */
  [Events.INIT_QUEUE]: [queue: Queue];
  /**
   * Emitted when the autoplay mode is enabled and no related song could be
   * found.
   */
  [Events.NO_RELATED]: [queue: Queue, error: DisTubeError];
  /**
   * Emitted when a song starts playing.
   */
  [Events.PLAY_SONG]: [queue: Queue, song: Song];
};

/**
 * The typed event listeners of a {@link DisTube} instance.
 *
 * Every listener of an event receives the arguments of
 * {@link DisTubeEvents}, and can be synchronous or asynchronous.
 */
export type TypedDisTubeEvents = {
  [K in keyof DisTubeEvents]: (...args: DisTubeEvents[K]) => Awaitable;
};

/**
 * The events emitted by a {@link DisTubeVoice} instance.
 */
export type DisTubeVoiceEvents = {
  /**
   * Emitted when the voice connection is disconnected.
   * @param error - The error that caused the disconnection, when there is one.
   */
  disconnect: (error?: Error) => Awaitable;
  /**
   * Emitted when an error occurs while playing the audio.
   * @param error - The error
   */
  error: (error: Error) => Awaitable;
  /**
   * Emitted when the audio player becomes idle, i.e. the song is finished.
   */
  finish: () => Awaitable;
};

/**
 * An FFmpeg audio filter object
 * ```ts
 * {
 *   name:  "bassboost",
 *   value: "bass=g=10"
 * }
 * ```ts
 */
export interface Filter {
  /**
   * Name of the filter
   */
  name: string;
  /**
   * FFmpeg audio filter argument
   */
  value: string;
}

/**
 * Data that resolves to give an FFmpeg audio filter. This can be:
 * - A name of a default filters or custom filters (`string`)
 * - A {@link Filter} object
 * @see {@link defaultFilters}
 * @see {@link DisTubeOptions|DisTubeOptions.customFilters}
 */
export type FilterResolvable = string | Filter;

/**
 * FFmpeg Filters
 * ```ts
 * {
 *   "Filter Name": "Filter Value",
 *   "bassboost":   "bass=g=10"
 * }
 * ```
 * @see {@link defaultFilters}
 */
export type Filters = Record<string, string>;

/**
 * DisTube options
 */
export type DisTubeOptions = {
  /**
   * DisTube plugins.
   * The order of this effects the priority of the plugins when verifying the input.
   */
  plugins?: DisTubePlugin[];
  /**
   * Whether or not emitting {@link Events.PLAY_SONG} event when looping a song
   * or next song is the same as the previous one
   * @default false
   */
  emitNewSongOnly?: boolean;
  /**
   * Whether or not saving the previous songs of the queue and enable {@link
   * Queue#previous} method. Disable it may help to reduce the memory usage
   * @default true
   */
  savePreviousSongs?: boolean;
  /**
   * Override {@link defaultFilters} or add more ffmpeg filters
   */
  customFilters?: Filters;
  /**
   * Whether or not playing age-restricted content and disabling safe search in
   * non-NSFW channel
   * @default false
   */
  nsfw?: boolean;
  /**
   * Whether or not emitting `addSong` event when creating a new Queue
   * @default true
   */
  emitAddSongWhenCreatingQueue?: boolean;
  /**
   * Whether or not emitting `addList` event when creating a new Queue
   * @default true
   */
  emitAddListWhenCreatingQueue?: boolean;
  /**
   * Whether or not joining the new voice channel when using {@link DisTube#play}
   * method
   * @default true
   */
  joinNewVoiceChannel?: boolean;
  /**
   * Behavior when the {@link Events.ERROR} event is emitted but nobody listens to it.
   *
   * By default (`"log"`), the error is logged to the console instead of crashing the
   * process, which is the Node.js default behavior for the special `"error"` event.
   * @default "log"
   */
  unhandledError?: UnhandledErrorBehavior;
  /**
   * Time (in milliseconds) a track may stay in the "buffering" state before it is
   * considered stuck and gets skipped automatically.
   *
   * Set to `0` to disable the stuck-track detection.
   * @default 10000
   */
  stuckThreshold?: number;
  /**
   * FFmpeg options
   */
  ffmpeg?: {
    /**
     * FFmpeg path
     */
    path?: string;
    /**
     * FFmpeg default arguments
     */
    args?: Partial<FFmpegArgs>;
  };
};

/**
 * Data that can be resolved to give a guild id string. This can be:
 * - A guild id string | a guild {@link https://discord.js.org/#/docs/main/stable/class/Snowflake|Snowflake}
 * - A {@link https://discord.js.org/#/docs/main/stable/class/Guild | Guild}
 * - A {@link https://discord.js.org/#/docs/main/stable/class/Message | Message}
 * - A {@link https://discord.js.org/#/docs/main/stable/class/BaseGuildVoiceChannel
 *   | BaseGuildVoiceChannel}
 * - A {@link https://discord.js.org/#/docs/main/stable/class/BaseGuildTextChannel
 *   | BaseGuildTextChannel}
 * - A {@link https://discord.js.org/#/docs/main/stable/class/VoiceState |
 *   VoiceState}
 * - A {@link https://discord.js.org/#/docs/main/stable/class/GuildMember |
 *   GuildMember}
 * - A {@link https://discord.js.org/#/docs/main/stable/class/Interaction |
 *   Interaction}
 * - A {@link DisTubeVoice}
 * - A {@link Queue}
 */
export type GuildIdResolvable =
  | Queue
  | DisTubeVoice
  | Snowflake
  | Message
  | GuildTextBasedChannel
  | VoiceBasedChannel
  | VoiceState
  | Guild
  | GuildMember
  | Interaction
  | string;

/**
 * The raw information of a song.
 *
 * It is the input of the {@link Song} constructor: a plugin builds it from
 * the data of its source.
 */
export interface SongInfo<T = unknown> {
  /**
   * The plugin that created this song, or `null` when it was created manually.
   */
  plugin: DisTubePlugin | null;
  /**
   * The identifier of the source of the song, e.g. `my-source`.
   */
  source: string;
  /**
   * Whether the song can be streamed directly from its source.
   *
   * When it is `false`, DisTube looks for a playable version of the song with
   * the other plugins.
   */
  playFromSource: boolean;
  /**
   * The identifier of the song in its source.
   */
  id: string;
  /**
   * The name of the song.
   */
  name?: string;
  /**
   * Whether the song is a live stream.
   */
  isLive?: boolean;
  /**
   * The duration of the song, in seconds.
   */
  duration?: number;
  /**
   * The URL of the song.
   */
  url?: string;
  /**
   * The URL of the thumbnail of the song.
   */
  thumbnail?: string;
  /**
   * The number of views of the song.
   */
  views?: number;
  /**
   * The number of likes of the song.
   */
  likes?: number;
  /**
   * The number of dislikes of the song.
   */
  dislikes?: number;
  /**
   * The number of reposts (shares) of the song.
   */
  reposts?: number;
  /**
   * The uploader (the author, the channel, ...) of the song.
   */
  uploader?: {
    /**
     * The name of the uploader.
     */
    name?: string;
    /**
     * The URL of the uploader.
     */
    url?: string;
  };
  /**
   * Whether the song is age-restricted.
   */
  ageRestricted?: boolean;
  /**
   * Source specific metadata of the song.
   *
   * It is used by the plugin that created the song to keep the data it needs to
   * play it (stream url, identifiers, ...). It is ignored when the song is
   * created with a `metadata` option.
   */
  metadata?: T;
}

/**
 * The raw information of a playlist.
 *
 * It is the input of the {@link Playlist} constructor: a plugin builds it from
 * the data of its source.
 */
export interface PlaylistInfo {
  /**
   * The identifier of the source of the playlist, e.g. `my-source`.
   */
  source: string;
  /**
   * The songs of the playlist.
   */
  songs: Song[];
  /**
   * The identifier of the playlist in its source.
   */
  id?: string;
  /**
   * The name of the playlist.
   */
  name?: string;
  /**
   * The URL of the playlist.
   */
  url?: string;
  /**
   * The URL of the thumbnail of the playlist.
   */
  thumbnail?: string;
}

/**
 * A song that is related to another song.
 *
 * It is the same as a {@link Song}, without the `related` property of the
 * previous versions of DisTube.
 */
export type RelatedSong = Omit<Song, "related">;

/**
 * The options of the handler of a song or a playlist.
 */
export type PlayHandlerOptions = {
  /**
   * [Default: false] Skip the playing song (if exists) and play the added playlist
   * instantly
   */
  skip?: boolean;
  /**
   * [Default: 0] Position of the song/playlist to add to the queue, \<= 0 to add to
   * the end of the queue
   */
  position?: number;
  /**
   * The default text channel of the queue
   */
  textChannel?: GuildTextBasedChannel;
};

/**
 * The options of a jump in the queue.
 */
export interface JumpOptions {
  /**
   * [Default: false] Whether or not skipped song(s) will be added to the end of the
   * queue
   */
  requeue?: boolean;
}

/**
 * The options of {@link DisTube#play}.
 */
export interface PlayOptions<T = unknown> extends PlayHandlerOptions, ResolveOptions<T> {
  /**
   * The message that triggered the command.
   *
   * It is used as the default {@link PlayHandlerOptions.textChannel} of the queue
   * when no `textChannel` is provided.
   */
  message?: Message;
}

/**
 * The kind of result a search is looking for.
 */
export enum SearchResultType {
  /**
   * A single track, i.e. a song.
   */
  TRACK = "track",
  /**
   * A video, i.e. a song with a video.
   */
  VIDEO = "video",
  /**
   * A playlist of songs.
   */
  PLAYLIST = "playlist",
  /**
   * An album of songs.
   */
  ALBUM = "album",
  /**
   * The songs of an artist.
   */
  ARTIST = "artist",
}

/**
 * The options of the resolution of a song or a playlist.
 */
export interface ResolveOptions<T = unknown> {
  /**
   * Requested user
   */
  member?: GuildMember;
  /**
   * Metadata
   */
  metadata?: T;
  /**
   * The source to resolve the input in.
   *
   * It matches the {@link Plugin.source} of a plugin, or one of its
   * {@link Plugin.aliases}. When it is not given, every plugin is used.
   */
  source?: string;
}

/**
 * Options of a search.
 */
export interface SearchOptions<T = unknown> extends ResolveOptions<T> {
  /**
   * [Default: 10] Maximum number of results.
   */
  limit?: number;
  /**
   * The kind of result the caller is looking for.
   */
  type?: SearchResultType;
  /**
   * Whether or not filtering the explicit content.
   */
  safeSearch?: boolean;
}

/**
 * The options of the resolution of a playlist.
 */
export interface ResolvePlaylistOptions<T = unknown> extends ResolveOptions<T> {
  /**
   * Source of the playlist
   */
  source?: string;
}

/**
 * The options of a custom playlist.
 */
export interface CustomPlaylistOptions {
  /**
   * A guild member creating the playlist
   */
  member?: GuildMember;
  /**
   * Whether or not fetch the songs in parallel
   */
  parallel?: boolean;
  /**
   * Metadata
   */
  metadata?: any;
  /**
   * Playlist name
   */
  name?: string;
  /**
   * Playlist source
   */
  source?: string;
  /**
   * Playlist url
   */
  url?: string;
  /**
   * Playlist thumbnail
   */
  thumbnail?: string;
}

/**
 * The repeat mode of a {@link Queue}
 */
export enum RepeatMode {
  /**
   * The queue plays every song once. `0`.
   */
  DISABLED,
  /**
   * The queue repeats the current song. `1`.
   */
  SONG,
  /**
   * The queue repeats the whole queue. `2`.
   */
  QUEUE,
}

/**
 * All available plugin types:
 */
export enum PluginType {
  /**
   * A plugin that extracts, searches and plays the songs of its source.
   * `"extractor"`: {@link ExtractorPlugin}
   */
  EXTRACTOR = "extractor",
  /**
   * A plugin that only extracts the info of the links of its source.
   * `"info-extractor"`: {@link InfoExtractorPlugin}
   */
  INFO_EXTRACTOR = "info-extractor",
  /**
   * A plugin that extracts and plays the songs of its source, but cannot
   * search for them. `"playable-extractor"`: {@link PlayableExtractorPlugin}
   */
  PLAYABLE_EXTRACTOR = "playable-extractor",
}

/**
 * Every kind of plugin DisTube can use.
 *
 * - {@link ExtractorPlugin}
 * - {@link InfoExtractorPlugin}
 * - {@link PlayableExtractorPlugin}
 */
export type DisTubePlugin = ExtractorPlugin | InfoExtractorPlugin | PlayableExtractorPlugin;

/**
 * A FFmpeg argument.
 *
 * The value is the argument itself (`"-1"`), or an array of the values of a
 * repeatable argument (`["-1", "-2"]`).
 */
export type FFmpegArg = Record<string, string | number | boolean | Array<string | null | undefined> | null | undefined>;

/**
 * FFmpeg arguments for different use cases
 */
export type FFmpegArgs = {
  /**
   * The arguments that are applied to the FFmpeg process itself.
   */
  global: FFmpegArg;
  /**
   * The arguments that are applied to the input of the FFmpeg process.
   */
  input: FFmpegArg;
  /**
   * The arguments that are applied to the output of the FFmpeg process.
   *
   * The `af` argument is replaced by the filters of the {@link Queue}.
   */
  output: FFmpegArg;
};

/**
 * FFmpeg options
 */
export type FFmpegOptions = {
  /**
   * Path to the ffmpeg executable
   * @default "ffmpeg"
   */
  path: string;
  /**
   * Arguments
   */
  args: FFmpegArgs;
};
