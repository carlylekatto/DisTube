import type { GuildTextBasedChannel, Snowflake } from "discord.js";
import { DEFAULT_VOLUME } from "../constant";
import { DisTubeBase } from "../core/DisTubeBase";
import type { DisTubeStream } from "../core/DisTubeStream";
import type { DisTubeVoice } from "../core/DisTubeVoice";
import { FilterManager } from "../core/manager/FilterManager";
import type { DisTube } from "../DisTube";
import type { DisTubeVoiceEvents, FFmpegArgs, JumpOptions } from "../type";
import { Events, RepeatMode } from "../type";
import { formatDuration, objectKeys } from "../util";
import { DisTubeError } from "./DisTubeError";
import type { Song } from "./Song";
import { TaskQueue } from "./TaskQueue";

/**
 * Represents a queue.
 */
export class Queue extends DisTubeBase {
  /**
   * Queue id (Guild id)
   */
  readonly id: Snowflake;
  /**
   * Voice connection of this queue.
   */
  voice: DisTubeVoice;
  /**
   * List of songs in the queue (The first one is the playing song)
   */
  songs: Song[];
  /**
   * List of the previous songs.
   */
  previousSongs: Song[];
  /**
   * Whether stream is currently stopped.
   */
  stopped: boolean;
  /**
   * Whether or not the stream is currently paused.
   *
   * It is also `true` once the queue has been stopped, so that `!queue.paused`
   * stays `false` as soon as the queue is not playing anymore.
   */
  paused: boolean;
  /**
   * Type of repeat mode (`0` is disabled, `1` is repeating a song, `2` is repeating
   * all the queue). Default value: `0` (disabled)
   */
  repeatMode: RepeatMode;
  /**
   * Whether or not the autoplay mode is enabled. Default value: `false`
   */
  autoplay: boolean;
  /**
   * FFmpeg arguments for the current queue. Default value is defined with {@link DisTubeOptions}.ffmpeg.args.
   * `af` output argument will be replaced with {@link Queue#filters} manager
   */
  ffmpegArgs: FFmpegArgs;
  /**
   * The text channel of the Queue. (Default: where the first command is called).
   */
  textChannel?: GuildTextBasedChannel;
  /**
   * What time in the song to begin (in seconds).
   * @internal
   */
  _beginTime: number;
  #filters: FilterManager;
  #initialized = false;
  /**
   * Whether or not the queue is being updated manually (skip, jump, previous)
   * @internal
   */
  _manualUpdate: boolean;
  /**
   * Task queuing system
   * @internal
   */
  _taskQueue: TaskQueue;
  /**
   * {@link DisTubeVoice} listener
   * @internal
   */
  _listeners?: DisTubeVoiceEvents;
  /**
   * Preload timer
   * @internal
   */
  _preloadTimeout?: NodeJS.Timeout;
  /**
   * Preloaded song
   * @internal
   */
  _preloadedSong?: Song;
  /**
   * Preloaded stream
   * @internal
   */
  _preloadedStream?: DisTubeStream;
  /**
   * In-flight preload task
   * @internal
   */
  _preloading?: Promise<void>;
  /**
   * Bumped whenever the preloaded state is invalidated, so an in-flight
   * preload task can detect that its result is no longer needed.
   * @internal
   */
  _preloadGeneration = 0;
  /**
   * Clear any preloaded song and cancel pending preload timer.
   * @internal
   */
  _clearPreload() {
    this._preloadGeneration++;
    if (this._preloadTimeout) {
      clearTimeout(this._preloadTimeout);
      this._preloadTimeout = undefined;
    }
    if (this._preloadedStream) {
      this._preloadedStream.kill();
      this._preloadedStream = undefined;
    }
    this._preloadedSong = undefined;
  }
  /**
   * Create a queue for the guild
   * @param distube     - DisTube
   * @param voice       - Voice connection
   * @param textChannel - Default text channel
   */
  constructor(distube: DisTube, voice: DisTubeVoice, textChannel?: GuildTextBasedChannel) {
    super(distube);
    this.voice = voice;
    this.id = voice.id;
    this.volume = DEFAULT_VOLUME;
    this.songs = [];
    this.previousSongs = [];
    this.stopped = false;
    this._manualUpdate = false;
    this.paused = false;
    this.repeatMode = RepeatMode.DISABLED;
    this.autoplay = false;
    this.#filters = new FilterManager(this);
    this._beginTime = 0;
    this.textChannel = textChannel;
    this._taskQueue = new TaskQueue();
    this._listeners = undefined;
    this.ffmpegArgs = {
      global: { ...this.options.ffmpeg.args.global },
      input: { ...this.options.ffmpeg.args.input },
      output: { ...this.options.ffmpeg.args.output },
    };
    this.#initialized = true;
  }
  #addToPreviousSongs(songs: Song | Song[]) {
    if (Array.isArray(songs)) {
      if (this.options.savePreviousSongs) {
        this.previousSongs.push(...songs);
      } else {
        this.previousSongs.push(...songs.map(s => ({ id: s.id }) as Song));
      }
    } else if (this.options.savePreviousSongs) {
      this.previousSongs.push(songs);
    } else {
      this.previousSongs.push({ id: songs.id } as Song);
    }
  }
  #stop() {
    this._manualUpdate = true;
    this.voice.stop();
  }
  /**
   * The client user as a `GuildMember` of this queue's guild
   */
  get clientMember() {
    return this.voice.channel.guild.members.me ?? undefined;
  }
  /**
   * The filter manager of the queue
   */
  get filters() {
    return this.#filters;
  }
  /**
   * Whether or not the queue is still active.
   *
   * It is `false` only when the queue has been stopped. A paused queue is still
   * active.
   */
  get isActive(): boolean {
    return !this.stopped;
  }
  /**
   * Formatted duration string.
   */
  get formattedDuration() {
    return formatDuration(this.duration);
  }
  /**
   * Queue's duration.
   */
  get duration() {
    return this.songs.length ? this.songs.reduce((prev, next) => prev + next.duration, 0) : 0;
  }
  /**
   * What time in the song is playing (in seconds).
   */
  get currentTime() {
    return this.voice.playbackTime;
  }
  /**
   * Formatted {@link Queue#currentTime} string.
   */
  get formattedCurrentTime() {
    return formatDuration(this.currentTime);
  }
  /**
   * The voice channel playing in.
   */
  get voiceChannel() {
    return this.clientMember?.voice?.channel ?? null;
  }
  /**
   * Get or set the stream volume. Default value: `50`.
   */
  get volume() {
    return this.voice.volume;
  }
  /**
   * Set the stream volume.
   * @param value - The volume percentage, from `0` to `100`
   * @throws {@link DisTubeError} When the volume is not a number, or when it is
   * negative
   */
  set volume(value: number) {
    const oldVolume = this.voice.volume;
    this.voice.volume = value;
    if (this.#initialized && oldVolume !== value) {
      this.emit(Events.SET_VOLUME, this, value, oldVolume);
    }
  }
  /**
   * Add a song or a list of songs to the queue.
   * @throws {DisTubeError}
   * @param song     - Song to add
   * @param position - Position to add, \<= 0 to add to the end of the queue
   * @returns The guild queue
   * @example
   * ```ts
   * queue.addToQueue(song);
   * ```
   */
  addToQueue(song: Song | Song[], position = 0): Queue {
    if (this.stopped) throw new DisTubeError("QUEUE_STOPPED");
    if (!song || (Array.isArray(song) && !song.length)) {
      throw new DisTubeError("INVALID_TYPE", ["Song", "Array<Song>"], song, "song");
    }
    if (typeof position !== "number" || !Number.isInteger(position)) {
      throw new DisTubeError("INVALID_TYPE", "integer", position, "position");
    }
    if (position <= 0) {
      if (Array.isArray(song)) this.songs.push(...song);
      else this.songs.push(song);
    } else if (Array.isArray(song)) {
      this.songs.splice(position, 0, ...song);
    } else {
      this.songs.splice(position, 0, song);
    }
    this.queues?.schedulePreload?.(this);
    return this;
  }
  /**
  /**
   * Pause the guild stream
   * @returns The guild queue
   * @throws {@link DisTubeError} When the queue is already paused
   * @example
   * ```ts
   * await queue.pause();
   * ```
   */
  async pause(): Promise<Queue> {
    await this._taskQueue.queuing();
    try {
      if (this.paused) throw new DisTubeError("PAUSED");
      this.paused = true;
      // A paused queue cannot know when the preloaded stream is still valid:
      // drop it and let resume() re-schedule a fresh preload.
      this._clearPreload();
      this.voice.pause();
      this.emit(Events.PAUSE_SONG, this, this.songs[0]);
      return this;
    } finally {
      this._taskQueue.resolve();
    }
  }
  /**
   * Resume the guild stream
   * @returns The guild queue
   * @throws {@link DisTubeError} When the queue is not paused
   * @example
   * ```ts
   * await queue.resume();
   * ```
   */
  async resume(): Promise<Queue> {
    await this._taskQueue.queuing();
    try {
      if (!this.paused) throw new DisTubeError("RESUMED");
      this.paused = false;
      this.voice.unpause();
      this.emit(Events.RESUME_SONG, this, this.songs[0]);
      this.queues?.schedulePreload?.(this);
      return this;
    } finally {
      this._taskQueue.resolve();
    }
  }
  /**
   * Set the guild stream's volume
   * @param percent - The percentage of volume you want to set
   * @returns The guild queue
   * @throws {@link DisTubeError} When the volume is not a number, or when it is
   * negative
   */
  setVolume(percent: number): Queue {
    this.volume = percent;
    return this;
  }

  /**
   * Skip the playing song if there is a next song in the queue. <info>If {@link
   * Queue#autoplay} is `true` and there is no up next song, DisTube will add and
   * play a related song.</info>
   * @param options - Skip options
   * @returns The song will skip to
   * @throws {@link DisTubeError} When there is no up next song, or when the
   * position is out of the bounds of the queue
   * @example
   * ```ts
   * await queue.skip();
   * ```
   */
  async skip(options?: JumpOptions): Promise<Song> {
    return this.jump(1, options);
  }

  /**
   * Play the previous song if exists
   * @returns The guild queue
   * @throws {@link DisTubeError} When {@link DisTubeOptions.savePreviousSongs} is
   * disabled, or when the queue does not have any previous song
   */
  async previous(): Promise<Song> {
    await this._taskQueue.queuing();
    try {
      if (!this.options.savePreviousSongs) throw new DisTubeError("DISABLED_OPTION", "savePreviousSongs");
      const hasPrevious = this.previousSongs.length > 0;
      if (!hasPrevious && this.repeatMode !== RepeatMode.QUEUE) {
        throw new DisTubeError("NO_PREVIOUS");
      }
      // In repeat-queue mode without any history, the last song of the queue is
      // replayed. It has to be removed from its position, otherwise it would be
      // queued twice.
      const song = hasPrevious ? this.previousSongs.pop() : this.songs.pop();
      if (!song) throw new DisTubeError("NO_PREVIOUS");
      this.songs.unshift(song);
      this.#stop();
      return song;
    } finally {
      this._taskQueue.resolve();
    }
  }
  /**
   * Shuffle the queue's songs
   * @returns The guild queue
   */
  async shuffle(): Promise<Queue> {
    await this._taskQueue.queuing();
    try {
      const playing = this.songs.shift();
      if (playing === undefined) return this;
      this._clearPreload();
      for (let i = this.songs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.songs[i], this.songs[j]] = [this.songs[j], this.songs[i]];
      }
      this.songs.unshift(playing);
      this.emit(Events.SHUFFLE_QUEUE, this, this.songs);
      this.queues?.schedulePreload?.(this);
      return this;
    } finally {
      this._taskQueue.resolve();
    }
  }
  /**
   * Jump to the song position in the queue. The next one is 1, 2,... The previous
   * one is -1, -2,...
   * if `num` is invalid number
   * @param position - The song position to play
   * @param options  - Skip options
   * @returns The new Song will be played
   * @throws {@link DisTubeError} When the position is invalid, when there is no
   * up next song, or when {@link DisTubeOptions.savePreviousSongs} is disabled
   * and the jump is backwards
   */
  async jump(position: number, options?: JumpOptions): Promise<Song> {
    await this._taskQueue.queuing();
    try {
      if (typeof position !== "number") throw new DisTubeError("INVALID_TYPE", "number", position, "position");
      if (!position || position > this.songs.length || -position > this.previousSongs.length) {
        throw new DisTubeError("NO_SONG_POSITION");
      }
      if (position > 0) {
        if (position >= this.songs.length) {
          if (this.autoplay) {
            await this._addRelatedSong();
          } else {
            throw new DisTubeError("NO_UP_NEXT");
          }
        }
        const skipped = this.songs.splice(0, position);
        if (options?.requeue) {
          this.songs.push(...skipped);
        } else {
          this.#addToPreviousSongs(skipped);
        }
        this.emit(Events.SKIP_SONG, this, skipped[0]);
      } else if (!this.options.savePreviousSongs) {
        throw new DisTubeError("DISABLED_OPTION", "savePreviousSongs");
      } else {
        const skipped = this.previousSongs.splice(position);
        this.songs.unshift(...skipped);
      }
      this._clearPreload();
      this.#stop();
      return this.songs[0];
    } finally {
      this._taskQueue.resolve();
    }
  }
  /**
   * Set the repeat mode of the guild queue.
   * Toggle mode `(Disabled -> Song -> Queue -> Disabled ->...)` if `mode` is `undefined`
   * @param mode - The repeat modes (toggle if `undefined`)
   * @returns The new repeat mode
   * @throws {@link DisTubeError} When the mode is not a valid {@link RepeatMode}
   */
  setRepeatMode(mode?: RepeatMode): RepeatMode {
    if (mode !== undefined && !Object.values(RepeatMode).includes(mode)) {
      throw new DisTubeError("INVALID_TYPE", ["RepeatMode", "undefined"], mode, "mode");
    }
    if (mode === undefined) this.repeatMode = (this.repeatMode + 1) % 3;
    else if (this.repeatMode === mode) this.repeatMode = RepeatMode.DISABLED;
    else this.repeatMode = mode;
    return this.repeatMode;
  }
  /**
   * Set the playing time to another position
   * @param time - Time in seconds
   * @returns The guild queue
   * @throws {@link DisTubeError} When the time is not a number, or when it is
   * negative
   * @example
   * ```ts
   * await queue.seek(60);
   * ```
   */
  async seek(time: number): Promise<Queue> {
    await this._taskQueue.queuing();
    try {
      if (typeof time !== "number") throw new DisTubeError("INVALID_TYPE", "number", time, "time");
      if (Number.isNaN(time) || time < 0) throw new DisTubeError("NUMBER_COMPARE", "time", "bigger or equal to", 0);
      this._clearPreload();
      this._beginTime = time;
      await this.play(false);
      this.emit(Events.SEEK_SONG, this, this.songs[0], time);
      return this;
    } finally {
      this._taskQueue.resolve();
    }
  }
  async #getRelatedSong(current: Song): Promise<Song[]> {
    const plugin = await this.handler._getPluginFromSong(current);
    if (plugin) return plugin.getRelatedSongs(current);
    return [];
  }
  /**
   * Internal implementation of addRelatedSong without task queue protection.
   * Used by methods that already hold the task queue lock.
   * @param song - The song to get related songs from. Defaults to the current playing song.
   * @returns A promise that resolves to the added song
   * @throws {@link DisTubeError} When the queue does not have any playing song,
   * or when no related song could be found
   * @internal
   */
  async _addRelatedSong(song?: Song): Promise<Song> {
    const current = song ?? this.songs?.[0];
    if (!current) throw new DisTubeError("NO_PLAYING_SONG");
    const prevIds = this.previousSongs.map(p => p.id);
    const relatedSongs = (await this.#getRelatedSong(current)).filter(s => !prevIds.includes(s.id));
    this.debug(`[${this.id}] Getting related songs from: ${current}`);
    if (!relatedSongs.length && !current.stream.playFromSource) {
      const altSong = current.stream.song;
      if (altSong) relatedSongs.push(...(await this.#getRelatedSong(altSong)).filter(s => !prevIds.includes(s.id)));
      this.debug(`[${this.id}] Getting related songs from streamed song: ${altSong}`);
    }
    const nextSong = relatedSongs[0];
    if (!nextSong) throw new DisTubeError("NO_RELATED");
    nextSong.metadata = current.metadata;
    nextSong.member = this.clientMember;
    this.addToQueue(nextSong);
    return nextSong;
  }
  /**
   * Add a related song of the playing song to the queue
   * @param song - The song to get related songs from. Defaults to the current playing song.
   * @returns The added song
   * @throws {@link DisTubeError} When the queue does not have any playing song,
   * or when no related song could be found
   */
  async addRelatedSong(song?: Song): Promise<Song> {
    await this._taskQueue.queuing();
    try {
      return await this._addRelatedSong(song);
    } finally {
      this._taskQueue.resolve();
    }
  }
  /**
   * Stop the guild stream and delete the queue
   * @returns A promise that resolves when the queue is stopped
   */
  async stop() {
    await this._taskQueue.queuing();
    try {
      this.voice.stop();
      this.remove();
    } finally {
      this._taskQueue.resolve();
    }
  }
  /**
   * Remove the queue from the manager
   * @returns Nothing
   */
  remove() {
    this._clearPreload();
    this.paused = true;
    this.stopped = true;
    this.songs = [];
    this.previousSongs = [];
    if (this._listeners) for (const event of objectKeys(this._listeners)) this.voice.off(event, this._listeners[event]);
    this.queues.remove(this.id);
    this.emit(Events.DELETE_QUEUE, this);
  }
  /**
   * Toggle autoplay mode
   * @returns Autoplay mode state
   */
  toggleAutoplay(): boolean {
    this.autoplay = !this.autoplay;
    return this.autoplay;
  }
  /**
   * Play the first song in the queue
   * @param emitPlaySong - Whether or not emit {@link Events.PLAY_SONG} event
   * @returns A promise that resolves when the song is playing
   * @throws {@link DisTubeError} When the queue has been stopped
   */
  play(emitPlaySong = true) {
    if (this.stopped) throw new DisTubeError("QUEUE_STOPPED");
    return this.queues.playSong(this, emitPlaySong);
  }
  /**
   * Restart the current stream with the current FFmpeg arguments, keeping the
   * playback position.
   *
   * The FFmpeg audio filters are applied when the stream is created, so the stream
   * has to be recreated whenever the filters change.
   *
   * Unlike a regular playback error, a failure while restarting the stream does
   * **not** remove the current song from the queue.
   * @returns A promise that resolves when the stream is restarted
   * @internal
   */
  async _restartStream(): Promise<void> {
    await this._taskQueue.queuing(true);
    try {
      if (this.stopped || !this.songs.length) return;
      this._beginTime = this.currentTime;
      await this.queues.playSong(this, false, { keepSongOnError: true });
    } finally {
      this._taskQueue.resolve();
    }
  }
}
