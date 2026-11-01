import type { GuildTextBasedChannel, VoiceBasedChannel } from "discord.js";
import type { FFmpegArg, Song } from "../..";
import {
  CROSSFADE_DRIFT_TOLERANCE_SECS,
  checkFFmpeg,
  DisTubeError,
  DisTubeStream,
  Events,
  objectKeys,
  Queue,
  RepeatMode,
} from "../..";
import { GuildIdManager } from "./GuildIdManager";

/**
 * Queue manager
 */
export class QueueManager extends GuildIdManager<Queue> {
  /**
   * Create a {@link Queue}
   * @param channel     - A voice channel
   * @param textChannel - Default text channel
   * @returns The created queue
   * @throws {@link DisTubeError} When the guild already has a queue, or when
   * the voice channel cannot be joined
   */
  async create(channel: VoiceBasedChannel, textChannel?: GuildTextBasedChannel): Promise<Queue> {
    if (this.has(channel.guildId)) throw new DisTubeError("QUEUE_EXIST");
    this.debug(`[QueueManager] Creating queue for guild: ${channel.guildId}`);
    const voice = this.voices.create(channel);
    const queue = new Queue(this.distube, voice, textChannel);
    await queue._taskQueue.queuing();
    try {
      checkFFmpeg(this.distube);
      this.debug(`[QueueManager] Joining voice channel: ${channel.id}`);
      await voice.join();
      this.#voiceEventHandler(queue);
      this.add(queue.id, queue);
      this.emit(Events.INIT_QUEUE, queue);
      return queue;
    } finally {
      queue._taskQueue.resolve();
    }
  }

  /**
   * Listen to DisTubeVoice events and handle the Queue
   * @param queue - Queue
   */
  #voiceEventHandler(queue: Queue) {
    queue._listeners = {
      disconnect: error => {
        queue.remove();
        this.emit(Events.DISCONNECT, queue);
        if (error) this.emitError(error, queue, queue.songs?.[0]);
      },
      error: error => void this.#handlePlayingError(queue, error),
      finish: () => void this.handleSongFinish(queue),
      channelChange: (oldChannel, newChannel) => {
        this.emit(Events.VOICE_CHANNEL_CHANGE, queue, oldChannel, newChannel);
      },
    };
    for (const event of objectKeys(queue._listeners)) {
      queue.voice.on(event, queue._listeners[event]);
    }
  }

  /**
   * Handle the queue when a Song finish
   * @param queue - queue
   * @returns A promise that resolves when the next song is playing
   */
  async handleSongFinish(queue: Queue): Promise<void> {
    if (queue._manualUpdate) {
      queue._manualUpdate = false;
      await this.playSong(queue);
      return;
    }
    this.debug(`[QueueManager] Handling song finish: ${queue.id}`);
    const song = queue.songs[0];
    this.emit(Events.FINISH_SONG, queue, song);
    await queue._taskQueue.queuing();
    try {
      if (queue.stopped) return;
      if (queue.repeatMode === RepeatMode.QUEUE) queue.songs.push(song);

      if (queue.repeatMode !== RepeatMode.SONG) {
        const prev = queue.songs.shift() as Song;
        if (this.options.savePreviousSongs) queue.previousSongs.push(prev);
        else queue.previousSongs.push({ id: prev.id } as Song);
      }

      if (queue.songs.length === 0 && queue.autoplay) {
        try {
          this.debug(`[QueueManager] Adding related song: ${queue.id}`);
          await queue._addRelatedSong(song);
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          this.debug(`[${queue.id}] Add related song error: ${errorMessage}`);
          if (e instanceof DisTubeError) {
            this.emit(Events.NO_RELATED, queue, e);
          } else {
            this.emit(Events.NO_RELATED, queue, new DisTubeError("NO_RELATED"));
          }
        }
      }

      if (queue.songs.length === 0) {
        this.debug(`[${queue.id}] Queue is empty, stopping...`);
        this.emit(Events.EMPTY, queue);
        if (!queue.autoplay) this.emit(Events.FINISH, queue);
        queue.remove();
        return;
      }

      if (song !== queue.songs[0]) {
        const playedSong = song.stream.playFromSource ? song : song.stream.song;
        if (playedSong?.stream.playFromSource) delete playedSong.stream.url;
      }
      await this.playSong(queue, true);
    } finally {
      queue._taskQueue.resolve();
    }
  }

  /**
   * Handle error while playing
   * @param queue - queue
   * @param error - error
   */
  async #handlePlayingError(queue: Queue, error: Error) {
    const song = queue.songs.shift()!;
    try {
      error.name = "PlayingError";
    } catch {
      // Emit original error
    }
    this.debug(`[${queue.id}] Error while playing: ${error.stack || error.message}`);
    this.emitError(error, queue, song);
    if (queue.songs.length > 0) {
      this.debug(`[${queue.id}] Playing next song: ${queue.songs[0]}`);
      await this.playSong(queue);
    } else {
      this.debug(`[${queue.id}] Queue is empty, stopping...`);
      await queue.stop();
    }
  }

  /**
   * Play a song on voice connection with queue properties
   * @param queue         - The guild queue to play
   * @param emitPlaySong  - Whether or not emit {@link Events.PLAY_SONG} event
   * @param options       - Optional options
   * @param options.keepSongOnError - Whether the current song has to stay in the
   * queue when the stream cannot be started
   * @returns A promise that resolves when the song is playing
   * @throws {@link DisTubeError} When the song does not have any stream URL
   */
  async playSong(queue: Queue, emitPlaySong = true, options?: { keepSongOnError?: boolean }) {
    if (!queue) return;
    if (queue.stopped || !queue.songs.length) {
      await queue.stop();
      return;
    }
    try {
      const song = queue.songs[0];
      let dtStream: DisTubeStream;

      if (queue._preloadedSong === song && queue._preloadedStream) {
        this.debug(`[${queue.id}] Using preloaded stream for: ${song}`);
        dtStream = queue._preloadedStream;
        queue._preloadedSong = undefined;
        queue._preloadedStream = undefined;
      } else {
        queue._clearPreload();
        this.debug(`[${queue.id}] Getting stream from: ${song}`);
        await this.handler.attachStreamInfo(song);
        const willPlaySong = song.stream.playFromSource ? song : song.stream.song;
        const stream = willPlaySong?.stream;
        if (!willPlaySong || !stream?.playFromSource || !stream.url) throw new DisTubeError("NO_STREAM_URL", `${song}`);
        this.debug(`[${queue.id}] Creating DisTubeStream for: ${willPlaySong}`);
        const streamOptions = {
          ffmpeg: {
            path: this.options.ffmpeg.path,
            args: {
              global: { ...queue.ffmpegArgs.global },
              input: { ...queue.ffmpegArgs.input },
              output: { ...queue.ffmpegArgs.output, ...queue.filters.ffmpegArgs },
            },
          },
          seek: willPlaySong.duration ? queue._beginTime : undefined,
        };
        queue._beginTime = 0;
        dtStream = new DisTubeStream(stream.url, streamOptions);
        dtStream.on("debug", data => this.emit(Events.FFMPEG_DEBUG, `[${queue.id}] ${data}`));
      }

      queue._beginTime = 0;
      this.debug(`[${queue.id}] Started playing: ${song}`);
      await queue.voice.play(dtStream);
      if (emitPlaySong) this.emit(Events.PLAY_SONG, queue, song);
      this.schedulePreload(queue);
      this.scheduleCrossfade(queue);
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      if (options?.keepSongOnError) {
        // The stream is only being restarted (e.g. after a filter change):
        // the current song must stay in the queue even if the restart failed.
        this.debug(`[${queue.id}] Error while restarting the stream: ${error.stack || error.message}`);
        this.emitError(error, queue, queue.songs[0]);
        return;
      }
      await this.#handlePlayingError(queue, error);
    }
  }

  /**
   * Schedule preloading the next song in the queue before the current song finishes.
   * @param queue - The guild queue
   */
  schedulePreload(queue: Queue) {
    if (!this.options.preload.enabled || queue.stopped || queue.paused) return;
    if (queue._preloadTimeout) {
      clearTimeout(queue._preloadTimeout);
      queue._preloadTimeout = undefined;
    }

    const currentSong = queue.songs[0];
    const nextSong = queue.songs[1];
    if (!currentSong || !nextSong) return;

    if (queue._preloadedSong === nextSong && queue._preloadedStream) return;

    const threshold = this.options.preload.threshold;
    const duration = currentSong.duration ?? 0;
    const currentTime = queue.currentTime;
    const remaining = duration > 0 && Number.isFinite(currentTime) ? duration - currentTime : 0;

    if (duration === 0 || remaining <= threshold) {
      void this.preloadNextSong(queue);
    } else {
      const delayMs = Math.max(0, (remaining - threshold) * 1000);
      queue._preloadTimeout = setTimeout(() => {
        queue._preloadTimeout = undefined;
        void this.preloadNextSong(queue);
      }, delayMs);
      queue._preloadTimeout.unref?.();
    }
  }

  /**
   * Preload the next song in the queue.
   * @param queue - The guild queue
   */
  async preloadNextSong(queue: Queue) {
    // Only one preload task may run at a time: playSong fires a preload
    // internally, and callers may request one concurrently as well.
    if (queue._preloading) return queue._preloading;
    const task = this.#preloadTask(queue);
    queue._preloading = task;
    try {
      await task;
    } finally {
      if (queue._preloading === task) queue._preloading = undefined;
    }
  }

  async #preloadTask(queue: Queue) {
    if (!this.options.preload.enabled || queue.stopped || queue.paused) return;
    const nextSong = queue.songs[1];
    if (!nextSong) return;
    if (queue._preloadedSong === nextSong && queue._preloadedStream) return;
    // The generation is bumped by _clearPreload(): when the preloaded state
    // is invalidated while this task is running, its result must be dropped.
    const generation = queue._preloadGeneration;

    this.debug(`[${queue.id}] Preloading next song: ${nextSong}`);
    this.emit(Events.PRELOAD_SONG, queue, nextSong);

    try {
      await this.handler.attachStreamInfo(nextSong);

      if (queue.stopped || queue.songs[1] !== nextSong || generation !== queue._preloadGeneration) return;

      const willPlaySong = nextSong.stream.playFromSource ? nextSong : nextSong.stream.song;
      const stream = willPlaySong?.stream;
      if (!willPlaySong || !stream?.playFromSource || !stream.url) {
        throw new DisTubeError("NO_STREAM_URL", `${nextSong}`);
      }

      const streamOptions = {
        ffmpeg: {
          path: this.options.ffmpeg.path,
          args: {
            global: { ...queue.ffmpegArgs.global },
            input: { ...queue.ffmpegArgs.input },
            output: { ...queue.ffmpegArgs.output, ...queue.filters.ffmpegArgs },
          },
        },
        seek: undefined,
      };

      const dtStream = new DisTubeStream(stream.url, streamOptions);
      dtStream.on("debug", data => this.emit(Events.FFMPEG_DEBUG, `[${queue.id}] [preload] ${data}`));

      if (queue.stopped || queue.songs[1] !== nextSong || generation !== queue._preloadGeneration) {
        dtStream.kill();
        return;
      }

      queue._preloadedSong = nextSong;
      queue._preloadedStream = dtStream;

      this.debug(`[${queue.id}] Successfully preloaded next song: ${nextSong}`);
      this.emit(Events.PRELOADED_SONG, queue, nextSong);
    } catch (e: unknown) {
      if (queue._preloadedSong === nextSong) {
        queue._preloadedSong = undefined;
        queue._preloadedStream?.kill();
        queue._preloadedStream = undefined;
      }
      const error = e instanceof Error ? e : new Error(String(e));
      this.debug(`[${queue.id}] Preload failed for ${nextSong}: ${error.message}`);
      this.emit(Events.PRELOAD_ERROR, queue, nextSong, error);
    }
  }

  /**
   * Schedule the crossfade into the next song: a single FFmpeg process mixes
   * the current song (seeked to its final fade window) with the next song, and
   * replaces the playback stream exactly when the fade window begins.
   *
   * Canceled automatically whenever the preloaded state is invalidated
   * (pause, seek, stop...), as both schedulers share the same generation.
   * @param queue - The guild queue
   */
  scheduleCrossfade(queue: Queue) {
    queue._crossfadeCancel();
    if (queue.stopped || queue.paused) return;
    const currentSong = queue.songs[0];
    if (!currentSong) return;
    const songDuration = currentSong.duration ?? 0;
    // Live songs have an unknown duration: they cannot be crossfaded.
    if (!songDuration || !Number.isFinite(songDuration)) return;
    const fade = Math.min(Number(queue.crossfade) || 0, songDuration);
    if (fade <= 0) return;
    const nextSong = queue.repeatMode === RepeatMode.SONG ? currentSong : queue.songs[1];
    if (!nextSong) return;
    const currentTime = queue.currentTime;
    if (!Number.isFinite(currentTime)) return;
    const remaining = songDuration - currentTime;
    if (remaining <= fade) return;
    const delayMs = Math.max(0, (remaining - fade - this.options.crossfade.warmup) * 1000);
    this.debug(
      `[${queue.id}] Scheduling crossfade (${fade}s fade) in ${(delayMs / 1000).toFixed(1)}s: ${currentSong} -> ${nextSong}`,
    );
    queue._crossfadeTimeout = setTimeout(() => {
      queue._crossfadeTimeout = undefined;
      void this.#crossfadeWarmupTask(queue);
    }, delayMs);
    queue._crossfadeTimeout.unref?.();
  }

  /**
   * Spawn the merged transition stream ahead of the fade window so both of
   * its inputs are buffered when the fade must start, then arm the boundary
   * timer that swaps the playback stream.
   */
  async #crossfadeWarmupTask(queue: Queue) {
    let transitionStream: DisTubeStream | undefined;
    try {
      if (queue.stopped || queue.paused) return;
      const song = queue.songs[0];
      const generation = queue._preloadGeneration;
      const repeatSong = queue.repeatMode === RepeatMode.SONG;
      const nextSong = repeatSong ? song : queue.songs[1];
      if (!song || !nextSong) return;
      const songDuration = song.duration ?? 0;
      const fade = Math.min(Number(queue.crossfade) || 0, songDuration);
      if (fade <= 0) return;
      const remaining = songDuration - queue.currentTime;
      if (remaining <= fade) return;
      if (!repeatSong) {
        // Resolve the next song's stream url if the preload has not done it
        // yet: the transition stream needs it before the fade starts.
        if (this.options.preload.enabled) await this.preloadNextSong(queue);
        else await this.handler.attachStreamInfo(nextSong);
      }
      if (queue.stopped || queue.paused || queue.songs[0] !== song || generation !== queue._preloadGeneration) return;
      if (repeatSong ? queue.songs[0] !== song : queue.songs[1] !== nextSong) return;

      const primary = song.stream.playFromSource ? song : song.stream.song;
      const secondary = repeatSong ? primary : nextSong.stream.playFromSource ? nextSong : nextSong.stream.song;
      if (!primary?.stream.playFromSource || !primary.stream.url) return;
      if (!secondary?.stream.playFromSource || !secondary.stream.url) return;

      this.debug(`[${queue.id}] Warming up crossfade stream: ${song} -> ${nextSong}`);
      const boundarySeek = Math.max(0, songDuration - fade);
      let primaryUrl: string = primary.stream.url;
      let primarySeek = boundarySeek;
      let primaryInputArgs: FFmpegArg | undefined;
      const prepare = this.options.crossfade.preparePrimaryInput;
      if (prepare) {
        try {
          const prepared = await prepare(primary.stream.url, { seek: boundarySeek, song });
          if (prepared?.url) {
            primaryUrl = prepared.url;
            if (typeof prepared.seek === "number" && Number.isFinite(prepared.seek) && prepared.seek >= 0) {
              primarySeek = prepared.seek;
            }
            primaryInputArgs = prepared.inputArgs;
            this.debug(`[${queue.id}] Crossfade primary input prepared by the adapter`);
          }
        } catch (e: unknown) {
          // Best-effort: fall back to the original url when the adapter fails.
          const errorMessage = e instanceof Error ? e.message : String(e);
          this.debug(`[${queue.id}] Crossfade primary input preparation failed: ${errorMessage}`);
        }
      }
      transitionStream = new DisTubeStream(primaryUrl, {
        ffmpeg: {
          path: this.options.ffmpeg.path,
          args: {
            global: { ...queue.ffmpegArgs.global },
            input: { ...queue.ffmpegArgs.input },
            output: { ...queue.ffmpegArgs.output, ...queue.filters.ffmpegArgs },
          },
        },
        crossfade: {
          duration: fade,
          primarySeek,
          secondaryUrl: secondary.stream.url,
          inCurve: this.options.crossfade.curve,
          outCurve: this.options.crossfade.curve,
          primaryInputArgs,
        },
      });
      transitionStream.on("debug", data => this.emit(Events.FFMPEG_DEBUG, `[${queue.id}] [crossfade] ${data}`));

      if (queue.stopped || queue.paused || queue.songs[0] !== song || generation !== queue._preloadGeneration) {
        transitionStream.kill();
        return;
      }
      queue._crossfadeWarmup = transitionStream;
      // Pre-spawn: until the boundary, both inputs buffer into the stream so
      // the fade can begin without waiting for any network round-trip.
      transitionStream.spawn();

      const boundaryMs = Math.max(0, (songDuration - queue.currentTime - fade) * 1000);
      queue._crossfadeTimeout = setTimeout(() => {
        queue._crossfadeTimeout = undefined;
        void this.#crossfadeSwapTask(queue, transitionStream!);
      }, boundaryMs);
      queue._crossfadeTimeout.unref?.();
    } catch (e: unknown) {
      // Crossfade is best-effort: fall back to the regular song transition.
      const errorMessage = e instanceof Error ? e.message : String(e);
      this.debug(`[${queue.id}] Crossfade warmup failed, using the regular transition: ${errorMessage}`);
      if (transitionStream) transitionStream.kill();
    }
  }

  /**
   * Swap the playing stream for the merged transition stream and update the
   * queue as if the current song had just finished.
   */
  async #crossfadeSwapTask(queue: Queue, transitionStream: DisTubeStream) {
    const abort = () => {
      if (queue._crossfadeWarmup === transitionStream) queue._crossfadeWarmup = undefined;
      transitionStream.kill();
    };
    try {
      if (queue.stopped || queue.paused || queue._crossfadeWarmup !== transitionStream) return abort();
      const song = queue.songs[0];
      if (!song) return abort();
      const songDuration = song.duration ?? 0;
      const fade = Math.min(Number(queue.crossfade) || 0, songDuration);
      if (fade <= 0) return abort();
      // The playback position must be inside the fade window: on drift, fall
      // back to the regular transition instead of miscalibrated audio.
      const drift = queue.currentTime - (songDuration - fade);
      if (Math.abs(drift) > CROSSFADE_DRIFT_TOLERANCE_SECS) {
        this.debug(`[${queue.id}] Crossfade aborted: playback drifted ${drift.toFixed(2)}s from the fade boundary`);
        return abort();
      }

      await queue._taskQueue.queuing();
      try {
        if (queue.stopped || queue.paused || queue.songs[0] !== song || queue._crossfadeWarmup !== transitionStream) {
          return abort();
        }
        // Swapping in a stream that has not produced its first frame yet would
        // leave the player buffering until FFmpeg catches up, and the stuck
        // watchdog would skip the song on slow sources. Falling back to the
        // regular transition keeps the playback alive instead.
        if (!transitionStream.hasBufferedAudio) {
          this.debug(`[${queue.id}] Crossfade aborted: the transition stream is not ready`);
          return abort();
        }
        this.debug(`[${queue.id}] Starting crossfade: ${song} -> ${queue.songs.length > 1 ? queue.songs[1] : song}`);
        await queue.voice.play(transitionStream);
        queue._crossfadeWarmup = undefined;

        // Update the queue exactly like a regular song finish.
        this.emit(Events.FINISH_SONG, queue, song);
        if (queue.repeatMode === RepeatMode.QUEUE) queue.songs.push(song);
        if (queue.repeatMode !== RepeatMode.SONG) {
          const prev = queue.songs.shift() as Song;
          if (this.options.savePreviousSongs) queue.previousSongs.push(prev);
          else queue.previousSongs.push({ id: prev.id } as Song);
        } else {
          // Repeat-song fades into a fresh playback of the same song: the
          // plain preloaded stream (if any) is replaced by the transition.
        }
        if (song !== queue.songs[0]) {
          const playedSong = song.stream.playFromSource ? song : song.stream.song;
          if (playedSong?.stream.playFromSource) delete playedSong.stream.url;
        }
        // The transition stream replaces whatever plain stream was preloaded
        // for the next song: its url is still resolved, so kill quietly.
        if (queue._preloadedStream) {
          queue._preloadedStream.kill();
          queue._preloadedStream = undefined;
          queue._preloadedSong = undefined;
        }
        this.emit(Events.PLAY_SONG, queue, queue.songs[0]);
        this.schedulePreload(queue);
        this.scheduleCrossfade(queue);
      } finally {
        queue._taskQueue.resolve();
      }
    } catch (e: unknown) {
      abort();
      // Keep the fallback predictable: the old song keeps playing and the
      // regular transition takes over when it ends.
      const errorMessage = e instanceof Error ? e.message : String(e);
      this.debug(`[${queue.id}] Crossfade swap failed, using the regular transition: ${errorMessage}`);
    }
  }
}
