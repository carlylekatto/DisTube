import type { Client, VoiceBasedChannel } from "discord.js";
import { TypedEmitter } from "tiny-typed-emitter";
import { defaultFilters, version } from "./constant";
import { DisTubeHandler } from "./core/DisTubeHandler";
import { Options } from "./core/DisTubeOptions";
import { DisTubeVoiceManager } from "./core/manager/DisTubeVoiceManager";
import { QueueManager } from "./core/manager/QueueManager";
import { DisTubeError } from "./struct/DisTubeError";
import type { ExtractorPlugin } from "./struct/ExtractorPlugin";
import { Playlist } from "./struct/Playlist";
import type { Queue } from "./struct/Queue";
import { SearchResult } from "./struct/SearchResult";
import { Song } from "./struct/Song";
import type {
  Awaitable,
  CustomPlaylistOptions,
  DisTubeOptions,
  DisTubePlugin,
  Filters,
  GuildIdResolvable,
  JumpOptions,
  PlayOptions,
  SearchOptions,
  TypedDisTubeEvents,
} from "./type";
import { Events, PluginType, type RepeatMode } from "./type";
import {
  checkIntents,
  handleUnhandledError,
  isClientInstance,
  isMemberInstance,
  isMessageInstance,
  isNsfwChannel,
  isObject,
  isSupportedVoiceChannel,
  isTextChannelInstance,
  isURL,
} from "./util";

/**
 * DisTube class
 */
export class DisTube extends TypedEmitter<TypedDisTubeEvents> {
  /**
   * @event
   * Emitted after DisTube add a new playlist to the playing {@link Queue}.
   * @param queue    - The guild queue
   * @param playlist - Playlist info
   */
  static readonly [Events.ADD_LIST]: (queue: Queue, playlist: Playlist) => Awaitable;
  /**
   * @event
   * Emitted after DisTube add a new song to the playing {@link Queue}.
   * @param queue - The guild queue
   * @param song  - Added song
   */
  static readonly [Events.ADD_SONG]: (queue: Queue, song: Song) => Awaitable;
  /**
   * @event
   * Emitted when the {@link Queue} is deleted with any reasons.
   * @param queue - The guild queue
   */
  static readonly [Events.DELETE_QUEUE]: (queue: Queue) => Awaitable;
  /**
   * @event
   * Emitted when the bot is disconnected to a voice channel.
   * @param queue - The guild queue
   */
  static readonly [Events.DISCONNECT]: (queue: Queue) => Awaitable;
  /**
   * @event
   * Emitted when the {@link Queue} runs out of songs to play.
   * @param queue - The guild queue
   */
  static readonly [Events.EMPTY]: (queue: Queue) => Awaitable;
  /**
   * @event
   * Emitted when DisTube encounters an error while playing songs.
   * @param error   - error
   * @param queue   - The queue encountered the error
   * @param song    - The playing song when encountered the error
   */
  static readonly [Events.ERROR]: (error: Error, queue: Queue, song?: Song) => Awaitable;
  /**
   * @event
   * Emitted for logging FFmpeg debug information.
   * @param debug - Debug message string.
   */
  static readonly [Events.FFMPEG_DEBUG]: (debug: string) => Awaitable;
  /**
   * @event
   * Emitted to provide debug information from DisTube's operation.
   * Useful for troubleshooting or logging purposes.
   *
   * @param debug - Debug message string.
   */
  static readonly [Events.DEBUG]: (debug: string) => Awaitable;
  /**
   * @event
   * Emitted when there is no more song in the queue and {@link Queue#autoplay} is `false`.
   * @param queue - The guild queue
   */
  static readonly [Events.FINISH]: (queue: Queue) => Awaitable;
  /**
   * @event
   * Emitted when DisTube finished a song.
   * @param queue - The guild queue
   * @param song  - Finished song
   */
  static readonly [Events.FINISH_SONG]: (queue: Queue, song: Song) => Awaitable;
  /**
   * @event
   * Emitted when DisTube initialize a queue to change queue default properties.
   * @param queue - The guild queue
   */
  static readonly [Events.INIT_QUEUE]: (queue: Queue) => Awaitable;
  /**
   * @event
   * Emitted when {@link Queue#autoplay} is `true`, {@link Queue#songs} is empty, and
   * DisTube cannot find related songs to play.
   * @param queue - The guild queue
   * @param error - The error that occurred while looking for related songs
   */
  static readonly [Events.NO_RELATED]: (queue: Queue, error: DisTubeError) => Awaitable;
  /**
   * @event
   * Emitted when DisTube play a song.
   * If {@link DisTubeOptions}.emitNewSongOnly is `true`, this event is not emitted
   * when looping a song or next song is the previous one.
   * @param queue - The guild queue
   * @param song  - Playing song
   */
  static readonly [Events.PLAY_SONG]: (queue: Queue, song: Song) => Awaitable;
  /**
   * DisTube internal handler
   */
  readonly handler: DisTubeHandler;
  /**
   * DisTube options
   */
  readonly options: Options;
  /**
   * Discord.js v14 client
   */
  readonly client: Client;
  /**
   * Queues manager
   */
  readonly queues: QueueManager;
  /**
   * DisTube voice connections manager
   */
  readonly voices: DisTubeVoiceManager;
  /**
   * DisTube plugins
   */
  readonly plugins: DisTubePlugin[];
  /**
   * DisTube ffmpeg audio filters
   */
  readonly filters: Filters;
  /**
   * Create a new DisTube class.
   * @throws {@link DisTubeError}
   * @param client - Discord.JS client
   * @param opts   - Custom DisTube options
   */
  constructor(client: Client, opts: DisTubeOptions = {}) {
    super();
    // Do not limit the number of listeners: bots commonly register several
    // listeners for the same event (e.g. one per guild).
    this.setMaxListeners(0);
    if (!isClientInstance(client)) throw new DisTubeError("INVALID_TYPE", "Discord.Client", client, "client");
    this.client = client;
    checkIntents(client.options);
    this.options = new Options(opts);
    this.voices = new DisTubeVoiceManager(this);
    this.handler = new DisTubeHandler(this);
    this.queues = new QueueManager(this);
    this.filters = { ...defaultFilters, ...this.options.customFilters };
    this.plugins = [...this.options.plugins];
    for (const p of this.plugins) p.init(this);
  }

  /**
   * Emit an event of the DisTube instance.
   *
   * The special {@link Events.ERROR} event is handled differently than the other
   * events: Node.js throws an `ERR_UNHANDLED_ERROR` when the special `"error"`
   * event is emitted without any listener, which crashes the whole process.
   *
   * Instead of crashing, DisTube follows {@link DisTubeOptions.unhandledError}
   * (`"log"` by default).
   * @param event - The event name
   * @param args  - The event arguments
   */
  override emit<U extends keyof TypedDisTubeEvents>(event: U, ...args: Parameters<TypedDisTubeEvents[U]>): boolean {
    if (event === Events.ERROR && this.listenerCount(Events.ERROR) === 0) {
      this.#handleUnhandledError(args[0] as Error);
      return false;
    }
    return super.emit(event, ...args);
  }

  /**
   * Handle an {@link Events.ERROR} event that has no listener.
   * @param error - The error
   */
  #handleUnhandledError(error: Error) {
    handleUnhandledError(error, this.options?.unhandledError ?? "log");
  }

  static get version() {
    return version;
  }

  /**
   * DisTube version
   */
  get version() {
    return version;
  }

  /**
   * Play / add a song or playlist from url.
   * Search and play a song (with {@link ExtractorPlugin}) if it is not a valid url.
   * @throws {@link DisTubeError}
   * @param voiceChannel - The channel will be joined if the bot isn't in any channels, the bot will be
   *                       moved to this channel if {@link DisTubeOptions}.joinNewVoiceChannel is `true`
   * @param song         - URL | Search string | {@link Song} | {@link Playlist}
   * @param options      - Optional options
   */
  async play<T = unknown>(
    voiceChannel: VoiceBasedChannel,
    song: string | Song | Playlist,
    options: PlayOptions<T> = {},
  ): Promise<void> {
    if (!isSupportedVoiceChannel(voiceChannel)) {
      throw new DisTubeError("INVALID_TYPE", "BaseGuildVoiceChannel", voiceChannel, "voiceChannel");
    }
    if (!isObject(options)) throw new DisTubeError("INVALID_TYPE", "object", options, "options");

    const { textChannel, member, skip, message, metadata, source } = {
      member: voiceChannel.guild.members.me ?? undefined,
      textChannel: options?.message?.channel,
      skip: false,
      ...options,
    };
    const position = Number(options.position) || (skip ? 1 : 0);

    if (message && !isMessageInstance(message)) {
      throw new DisTubeError("INVALID_TYPE", ["Discord.Message", "a falsy value"], message, "options.message");
    }
    if (textChannel && !isTextChannelInstance(textChannel)) {
      throw new DisTubeError("INVALID_TYPE", "Discord.GuildTextBasedChannel", textChannel, "options.textChannel");
    }
    if (member && !isMemberInstance(member)) {
      throw new DisTubeError("INVALID_TYPE", "Discord.GuildMember", member, "options.member");
    }

    const queue = this.getQueue(voiceChannel) || (await this.queues.create(voiceChannel, textChannel));
    await queue._taskQueue.queuing(true);
    try {
      this.debug(`[${queue.id}] Playing input: ${song}`);
      const resolved = await this.handler.resolve(song, { member, metadata, source });
      const isNsfw = isNsfwChannel(queue?.textChannel || textChannel);
      const isFirstSong = queue.songs.length === 0;
      if (resolved instanceof Playlist) {
        if (!this.options.nsfw && !isNsfw) {
          resolved.songs = resolved.songs.filter(s => !s.ageRestricted);
          if (!resolved.songs.length) throw new DisTubeError("EMPTY_FILTERED_PLAYLIST");
        }
        if (!resolved.songs.length) throw new DisTubeError("EMPTY_PLAYLIST");
        this.debug(`[${queue.id}] Adding playlist to queue: ${resolved.songs.length} songs`);
        queue.addToQueue(resolved.songs, position);
        if (!isFirstSong || this.options.emitAddListWhenCreatingQueue) this.emit(Events.ADD_LIST, queue, resolved);
      } else {
        if (!this.options.nsfw && resolved.ageRestricted && !isNsfwChannel(queue?.textChannel || textChannel)) {
          throw new DisTubeError("NON_NSFW");
        }
        this.debug(`[${queue.id}] Adding song to queue: ${resolved.name || resolved.url || resolved.id || resolved}`);
        queue.addToQueue(resolved, position);
        if (!isFirstSong || this.options.emitAddSongWhenCreatingQueue) this.emit(Events.ADD_SONG, queue, resolved);
      }

      if (isFirstSong) await queue.play();
      else if (skip) await queue.skip();
    } catch (e: unknown) {
      if (!(e instanceof DisTubeError)) {
        const errorMessage = e instanceof Error ? (e.stack ?? e.message) : String(e);
        this.debug(`[${queue.id}] Unexpected error while playing song: ${errorMessage}`);
        if (e instanceof Error) {
          try {
            e.name = "PlayError";
            e.message = `${typeof song === "string" ? song : song.url}\n${e.message}`;
          } catch {
            // Some errors have read-only properties, throw original error
          }
        }
      }
      throw e;
    } finally {
      if (!queue.songs.length && !queue._taskQueue.hasPlayTask) queue.remove();
      queue._taskQueue.resolve();
    }
  }

  /**
   * Create a custom playlist
   * @param songs   - Array of url or Song
   * @param options - Optional options
   */
  async createCustomPlaylist(
    songs: (string | Song)[],
    { member, parallel, metadata, name, source, url, thumbnail }: CustomPlaylistOptions = {},
  ): Promise<Playlist> {
    if (!Array.isArray(songs)) throw new DisTubeError("INVALID_TYPE", "Array", songs, "songs");
    if (!songs.length) throw new DisTubeError("EMPTY_ARRAY", "songs");
    const filteredSongs = songs.filter(song => song instanceof Song || isURL(song));
    if (!filteredSongs.length) throw new DisTubeError("NO_VALID_SONG");
    if (member && !isMemberInstance(member)) {
      throw new DisTubeError("INVALID_TYPE", "Discord.Member", member, "options.member");
    }
    let resolvedSongs: Song[];
    if (parallel !== false) {
      const promises = filteredSongs.map((song: string | Song) =>
        this.handler.resolve(song, { member, metadata }).catch(() => undefined),
      );
      resolvedSongs = (await Promise.all(promises)).filter((s): s is Song => s instanceof Song);
    } else {
      resolvedSongs = [];
      for (const song of filteredSongs) {
        const resolved = await this.handler.resolve(song, { member, metadata }).catch(() => undefined);
        if (resolved instanceof Song) resolvedSongs.push(resolved);
      }
    }
    return new Playlist(
      {
        source: source || "custom",
        name,
        url,
        thumbnail: thumbnail || resolvedSongs.find(s => s.thumbnail)?.thumbnail,
        songs: resolvedSongs,
      },
      { member, metadata },
    );
  }

  /**
   * Get the guild queue
   * @param guild - The type can be resolved to give a {@link Queue}
   */
  getQueue(guild: GuildIdResolvable): Queue | undefined {
    return this.queues.get(guild);
  }

  /**
   * Get a plugin by the identifier of its source.
   *
   * It matches the {@link Plugin.source} of the plugin, or one of its
   * {@link Plugin.aliases}. The identifier of the class is used when the
   * plugin does not define a source (`YoutubePlugin` -> `youtube`).
   * @param source - The identifier of the source
   * @returns The plugin, or `undefined` when there is none
   */
  getPlugin(source: string): DisTubePlugin | undefined {
    if (typeof source !== "string" || !source) return undefined;
    const identifier = source.toLowerCase();
    return this.plugins.find(plugin => plugin.identifiers.includes(identifier));
  }

  /**
   * Search for the songs of the plugins.
   *
   * The plugins are used in the order they were registered. When
   * {@link ResolveOptions.source} is given, only the matching plugin is used.
   * @param query   - The search query
   * @param options - Optional options
   * @returns The result of the search
   */
  async search<T = unknown>(query: string, options: SearchOptions<T> = {}): Promise<SearchResult<T>> {
    const limit = options.limit ?? 10;
    const plugins: ExtractorPlugin[] = options.source
      ? [this.getPlugin(options.source)].filter(
          (plugin): plugin is ExtractorPlugin => plugin?.type === PluginType.EXTRACTOR,
        )
      : this.plugins.filter((plugin): plugin is ExtractorPlugin => plugin.type === PluginType.EXTRACTOR);

    const songs: Song<T>[] = [];
    const sources: string[] = [];
    let playlist: Playlist<T> | undefined;

    for (const plugin of plugins) {
      if (songs.length >= limit) break;
      const found = await plugin.search<T>(query, { ...options, limit: limit - songs.length });
      if (!found) continue;
      if (found.songs.length) {
        songs.push(...found.songs);
        sources.push(plugin.identifiers[0] ?? plugin.constructor.name);
      }
      playlist ??= found.playlist;
    }

    return new SearchResult<T>(query, {
      songs: songs.slice(0, limit),
      playlist,
      queryType: options.type,
      sources,
    });
  }

  #getQueue(guild: GuildIdResolvable): Queue {
    const queue = this.getQueue(guild);
    if (!queue) throw new DisTubeError("NO_QUEUE");
    return queue;
  }

  /**
   * Pause the guild stream
   * @param guild - The type can be resolved to give a {@link Queue}
   * @returns The guild queue
   * @deprecated Use `distube.getQueue(guild).pause()` instead. Will be removed in v6.0.
   */
  pause(guild: GuildIdResolvable): Promise<Queue> {
    return this.#getQueue(guild).pause();
  }

  /**
   * Resume the guild stream
   * @param guild - The type can be resolved to give a {@link Queue}
   * @returns The guild queue
   * @deprecated Use `distube.getQueue(guild).resume()` instead. Will be removed in v6.0.
   */
  resume(guild: GuildIdResolvable): Promise<Queue> {
    return this.#getQueue(guild).resume();
  }

  /**
   * Stop the guild stream
   * @param guild - The type can be resolved to give a {@link Queue}
   * @deprecated Use `distube.getQueue(guild).stop()` instead. Will be removed in v6.0.
   */
  stop(guild: GuildIdResolvable): Promise<void> {
    return this.#getQueue(guild).stop();
  }

  /**
   * Set the guild stream's volume
   * @param guild   - The type can be resolved to give a {@link Queue}
   * @param percent - The percentage of volume you want to set
   * @returns The guild queue
   * @deprecated Use `distube.getQueue(guild).setVolume(percent)` instead. Will be removed in v6.0.
   */
  setVolume(guild: GuildIdResolvable, percent: number): Queue {
    return this.#getQueue(guild).setVolume(percent);
  }

  /**
   * Skip the playing song if there is a next song in the queue. <info>If {@link
   * Queue#autoplay} is `true` and there is no up next song, DisTube will add and
   * play a related song.</info>
   * @param guild - The type can be resolved to give a {@link Queue}
   * @returns The new Song will be played
   * @deprecated Use `distube.getQueue(guild).skip(options)` instead. Will be removed in v6.0.
   */
  skip(guild: GuildIdResolvable, options?: JumpOptions): Promise<Song> {
    return this.#getQueue(guild).skip(options);
  }

  /**
   * Play the previous song
   * @param guild - The type can be resolved to give a {@link Queue}
   * @returns The new Song will be played
   * @deprecated Use `distube.getQueue(guild).previous()` instead. Will be removed in v6.0.
   */
  previous(guild: GuildIdResolvable): Promise<Song> {
    return this.#getQueue(guild).previous();
  }

  /**
   * Shuffle the guild queue songs
   * @param guild - The type can be resolved to give a {@link Queue}
   * @returns The guild queue
   * @deprecated Use `distube.getQueue(guild).shuffle()` instead. Will be removed in v6.0.
   */
  shuffle(guild: GuildIdResolvable): Promise<Queue> {
    return this.#getQueue(guild).shuffle();
  }

  /**
   * Jump to the song number in the queue. The next one is 1, 2,... The previous one
   * is -1, -2,...
   * @param guild - The type can be resolved to give a {@link Queue}
   * @param num   - The song number to play
   * @returns The new Song will be played
   * @deprecated Use `distube.getQueue(guild).jump(num, options)` instead. Will be removed in v6.0.
   */
  jump(guild: GuildIdResolvable, num: number, options?: JumpOptions): Promise<Song> {
    return this.#getQueue(guild).jump(num, options);
  }

  /**
   * Set the repeat mode of the guild queue.
   * Toggle mode `(Disabled -> Song -> Queue -> Disabled ->...)` if `mode` is `undefined`
   * @param guild - The type can be resolved to give a {@link Queue}
   * @param mode  - The repeat modes (toggle if `undefined`)
   * @returns The new repeat mode
   * @deprecated Use `distube.getQueue(guild).setRepeatMode(mode)` instead. Will be removed in v6.0.
   */
  setRepeatMode(guild: GuildIdResolvable, mode?: RepeatMode): RepeatMode {
    return this.#getQueue(guild).setRepeatMode(mode);
  }

  /**
   * Toggle autoplay mode
   * @param guild - The type can be resolved to give a {@link Queue}
   * @returns Autoplay mode state
   * @deprecated Use `distube.getQueue(guild).toggleAutoplay()` instead. Will be removed in v6.0.
   */
  toggleAutoplay(guild: GuildIdResolvable): boolean {
    const queue = this.#getQueue(guild);
    queue.autoplay = !queue.autoplay;
    return queue.autoplay;
  }

  /**
   * Add related song to the queue
   * @param guild - The type can be resolved to give a {@link Queue}
   * @returns The guild queue
   * @deprecated Use `distube.getQueue(guild).addRelatedSong()` instead. Will be removed in v6.0.
   */
  addRelatedSong(guild: GuildIdResolvable): Promise<Song> {
    return this.#getQueue(guild).addRelatedSong();
  }

  /**
   * Set the playing time to another position
   * @param guild - The type can be resolved to give a {@link Queue}
   * @param time  - Time in seconds
   * @returns Seeked queue
   * @deprecated Use `distube.getQueue(guild).seek(time)` instead. Will be removed in v6.0.
   */
  seek(guild: GuildIdResolvable, time: number): Promise<Queue> {
    return this.#getQueue(guild).seek(time);
  }

  /**
   * Emit error event
   * @param error   - error
   * @param queue   - The queue encountered the error
   * @param song    - The playing song when encountered the error
   */
  emitError(error: Error, queue: Queue, song?: Song): void {
    this.emit(Events.ERROR, error, queue, song);
  }

  /**
   * Emit debug event
   * @param message - debug message
   */
  debug(message: string) {
    this.emit(Events.DEBUG, message);
  }

  /**
   * Destroy the DisTube instance.
   *
   * Stops every queue, leaves every voice channel, destroys every plugin and
   * removes every listener.
   * Call it before your Discord.js client is destroyed to release all resources.
   */
  async destroy(): Promise<void> {
    this.debug("[DisTube] Destroying the DisTube instance...");
    const queues = [...this.queues.collection.values()];
    for (const queue of queues) {
      try {
        await queue.stop();
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        this.debug(`[DisTube] Failed to stop the queue ${queue.id}: ${errorMessage}`);
      }
    }
    const voices = [...this.voices.collection.values()];
    for (const voice of voices) {
      try {
        voice.leave();
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        this.debug(`[DisTube] Failed to leave the voice connection ${voice.id}: ${errorMessage}`);
      }
    }
    for (const plugin of this.plugins) {
      try {
        await plugin.destroy();
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        this.debug(`[DisTube] Failed to destroy the plugin ${plugin.constructor.name}: ${errorMessage}`);
      }
    }
    this.removeAllListeners();
  }
}

export default DisTube;
