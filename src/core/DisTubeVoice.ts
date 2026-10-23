import type { AudioPlayer, VoiceConnection } from "@discordjs/voice";
import {
  AudioPlayerStatus,
  createAudioPlayer,
  entersState,
  joinVoiceChannel,
  VoiceConnectionDisconnectReason,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import type { Snowflake, VoiceBasedChannel, VoiceState } from "discord.js";
import { Constants } from "discord.js";
import { TypedEmitter } from "tiny-typed-emitter";
import { JOIN_TIMEOUT_MS, RECONNECT_MAX_ATTEMPTS, RECONNECT_TIMEOUT_MS } from "../constant";
import { DisTubeError } from "../struct/DisTubeError";
import type { DisTubeVoiceEvents } from "../type";
import { checkEncryptionLibraries, handleUnhandledError, isSupportedVoiceChannel } from "../util";
import type { DisTubeStream } from "./DisTubeStream";
import type { DisTubeVoiceManager } from "./manager/DisTubeVoiceManager";

/**
 * Create a voice connection to the voice channel
 */
export class DisTubeVoice extends TypedEmitter<DisTubeVoiceEvents> {
  /**
   * The id of the guild of this voice connection.
   */
  readonly id: Snowflake;
  /**
   * The voice manager that instantiated this connection.
   */
  readonly voices: DisTubeVoiceManager;
  /**
   * The audio player that plays the audio of this connection.
   */
  readonly audioPlayer: AudioPlayer;
  /**
   * The Discord.js voice connection.
   */
  connection!: VoiceConnection;
  /**
   * Whether or not an error was already emitted for the current stream.
   *
   * It prevents the same error from being emitted several times.
   */
  emittedError!: boolean;
  /**
   * Whether or not the voice connection has been disconnected.
   */
  isDisconnected = false;
  /**
   * The stream that is currently playing.
   */
  stream?: DisTubeStream;
  /**
   * The stream that was playing when the playback was paused.
   */
  pausingStream?: DisTubeStream;
  #channel!: VoiceBasedChannel;
  #volume = 100;
  /**
   * Timer used to detect a track that is stuck in the "buffering" state.
   */
  #stuckTimer?: NodeJS.Timeout;
  /**
   * Create a voice connection to the voice channel.
   * @param voiceManager - The voice manager of the DisTube instance
   * @param channel      - The voice channel to join
   */
  constructor(voiceManager: DisTubeVoiceManager, channel: VoiceBasedChannel) {
    super();
    this.voices = voiceManager;
    this.id = channel.guildId;
    this.channel = channel;
    this.voices.add(this.id, this);
    this.audioPlayer = createAudioPlayer()
      .on(AudioPlayerStatus.Idle, oldState => {
        this.#clearStuckTimer();
        if (oldState.status !== AudioPlayerStatus.Idle) this.emit("finish");
      })
      .on(AudioPlayerStatus.Buffering, () => {
        this.#startStuckTimer();
      })
      .on(AudioPlayerStatus.Playing, () => {
        this.#clearStuckTimer();
      })
      .on("error", (error: NodeJS.ErrnoException) => {
        if (this.emittedError) return;
        this.emittedError = true;
        this.emit("error", error);
      });
    this.connection
      .on(VoiceConnectionStatus.Disconnected, (_, newState) => {
        if (newState.reason === VoiceConnectionDisconnectReason.Manual) {
          // User disconnect
          this.leave();
        } else if (newState.reason === VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
          // Move to other channel
          entersState(this.connection, VoiceConnectionStatus.Connecting, RECONNECT_TIMEOUT_MS)
            .then(() => entersState(this.connection, VoiceConnectionStatus.Ready, RECONNECT_TIMEOUT_MS))
            .then(() => {
              const oldChannel = this.#channel;
              const currentChannel = this.channel;
              if (oldChannel && currentChannel && oldChannel.id !== currentChannel.id) {
                this.#channel = currentChannel;
                this.emit("channelChange", oldChannel, currentChannel);
              }
            })
            .catch(() => {
              if (
                ![VoiceConnectionStatus.Ready, VoiceConnectionStatus.Connecting].includes(this.connection.state.status)
              ) {
                this.leave();
              }
            });
        } else if (this.connection.rejoinAttempts < RECONNECT_MAX_ATTEMPTS) {
          // Try to rejoin
          setTimeout(
            () => {
              this.connection.rejoin();
            },
            (this.connection.rejoinAttempts + 1) * RECONNECT_TIMEOUT_MS,
          ).unref();
        } else if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
          // Leave after 5 attempts
          this.leave(new DisTubeError("VOICE_RECONNECT_FAILED"));
        }
      })
      .on(VoiceConnectionStatus.Destroyed, () => {
        this.leave();
      })
      .on("error", () => undefined);
    this.connection.subscribe(this.audioPlayer);
  }
  /**
   * The voice channel id the bot is in
   */
  get channelId() {
    return this.connection?.joinConfig?.channelId ?? undefined;
  }
  /**
   * The voice channel the bot is in.
   *
   * Setting it moves the bot to another voice channel.
   */
  get channel() {
    if (!this.channelId) return this.#channel;
    if (this.#channel?.id === this.channelId) return this.#channel;
    const channel = this.voices.client.channels.cache.get(this.channelId);
    if (!channel) return this.#channel;
    for (const type of Constants.VoiceBasedChannelTypes) {
      if (channel.type === type) {
        this.#channel = channel;
        return channel;
      }
    }
    return this.#channel;
  }
  /**
   * Move the bot to another voice channel.
   * @param channel - The voice channel to join
   * @throws {@link DisTubeError} When the channel is invalid, when it belongs to
   * another guild or client, or when the bot cannot join it
   */
  set channel(channel: VoiceBasedChannel) {
    if (!isSupportedVoiceChannel(channel)) {
      throw new DisTubeError("INVALID_TYPE", "BaseGuildVoiceChannel", channel, "DisTubeVoice#channel");
    }
    if (channel.guildId !== this.id) throw new DisTubeError("VOICE_DIFFERENT_GUILD");
    if (channel.client.user?.id !== this.voices.client.user?.id) throw new DisTubeError("VOICE_DIFFERENT_CLIENT");
    if (channel.id === this.channelId) return;
    if (!channel.joinable) {
      if (channel.full) throw new DisTubeError("VOICE_FULL");
      else throw new DisTubeError("VOICE_MISSING_PERMS");
    }
    const oldChannel = this.#channel;
    this.connection = this.#join(channel);
    this.#channel = channel;
    if (oldChannel && oldChannel.id !== channel.id) {
      this.emit("channelChange", oldChannel, channel);
    }
  }
  #join(channel: VoiceBasedChannel) {
    return joinVoiceChannel({
      channelId: channel.id,
      guildId: this.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      group: channel.client.user?.id,
      // DAVE is the end-to-end encryption protocol used by Discord.
      // It is enabled explicitly so that a change of the upstream default
      // can never silently disable the encryption.
      daveEncryption: true,
    });
  }
  /**
   * Join a voice channel with this connection
   * @param channel - A voice channel
   * @returns The voice connection
   * @throws {@link DisTubeError} When the connection cannot be established
   */
  async join(channel?: VoiceBasedChannel): Promise<DisTubeVoice> {
    if (channel) this.channel = channel;
    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, JOIN_TIMEOUT_MS);
    } catch {
      if (this.connection.state.status === VoiceConnectionStatus.Ready) return this;
      if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) this.connection.destroy();
      this.voices.remove(this.id);
      throw new DisTubeError("VOICE_CONNECT_FAILED", JOIN_TIMEOUT_MS / 1000);
    }
    return this;
  }
  /**
   * Leave the voice channel of this connection
   * @param error - Optional, an error to emit with 'error' event.
   * @returns Nothing
   */
  leave(error?: Error) {
    this.stop(true);
    if (!this.isDisconnected) {
      this.emit("disconnect", error);
      this.isDisconnected = true;
    }
    if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) this.connection.destroy();
    this.voices.remove(this.id);
  }
  /**
   * Stop the playing stream
   * @param force - If true, will force the {@link DisTubeVoice#audioPlayer} to enter the Idle state even
   *                if the {@link DisTubeStream#audioResource} has silence padding frames.
   * @returns Nothing
   */
  stop(force = false) {
    this.audioPlayer.stop(force);
  }
  #streamErrorHandler?: (error: NodeJS.ErrnoException) => void;
  /**
   * Play a {@link DisTubeStream}
   * @param dtStream - DisTubeStream
   * @returns A promise that resolves when the stream is playing
   * @throws {@link DisTubeError} When no encryption library is available
   */
  async play(dtStream: DisTubeStream) {
    if (!(await checkEncryptionLibraries())) {
      dtStream.kill();
      throw new DisTubeError("ENCRYPTION_LIBRARIES_MISSING");
    }
    this.emittedError = false;
    // Remove previous error listener to prevent memory leaks
    if (this.stream && this.#streamErrorHandler) {
      this.stream.off("error", this.#streamErrorHandler);
    }
    this.#streamErrorHandler = (error: NodeJS.ErrnoException) => {
      if (this.emittedError || error.code === "ERR_STREAM_PREMATURE_CLOSE") return;
      this.emittedError = true;
      this.emit("error", error);
    };
    dtStream.on("error", this.#streamErrorHandler);
    if (this.audioPlayer.state.status !== AudioPlayerStatus.Paused) {
      this.audioPlayer.play(dtStream.audioResource);
      this.stream?.kill();
      dtStream.spawn();
    } else if (!this.pausingStream) {
      this.pausingStream = this.stream;
    }
    this.stream = dtStream;
    this.volume = this.#volume;
  }
  /**
   * Set the volume percentage of the stream.
   * @param volume - The volume percentage, from `0` to `100`
   * @throws {@link DisTubeError} When the volume is not a number, or when it is
   * negative
   */
  set volume(volume: number) {
    if (typeof volume !== "number" || Number.isNaN(volume)) {
      throw new DisTubeError("INVALID_TYPE", "number", volume, "volume");
    }
    if (volume < 0) {
      throw new DisTubeError("NUMBER_COMPARE", "Volume", "bigger or equal to", 0);
    }
    this.#volume = volume;
    this.stream?.setVolume((this.#volume / 100) ** (0.5 / Math.log10(2)));
  }
  /**
   * Get or set the volume percentage
   */
  get volume() {
    return this.#volume;
  }
  /**
   * Playback duration of the audio resource in seconds (time since playback started)
   */
  get playbackDuration() {
    return (this.stream?.audioResource?.playbackDuration ?? 0) / 1000;
  }
  /**
   * Current playback time in seconds, accounting for seek offset
   */
  get playbackTime() {
    return this.playbackDuration + (this.stream?.seekTime ?? 0);
  }
  /**
   * Pause the playback of the audio player.
   * @returns Nothing
   */
  pause() {
    this.audioPlayer.pause();
  }
  /**
   * Resume the playback of the audio player.
   *
   * The FFmpeg process is spawned again when the stream was killed while the
   * playback was paused.
   * @returns Nothing
   */
  unpause() {
    const state = this.audioPlayer.state;
    if (state.status !== AudioPlayerStatus.Paused) return;
    if (this.stream?.audioResource && state.resource !== this.stream.audioResource) {
      this.audioPlayer.play(this.stream.audioResource);
      this.stream.spawn();
      this.pausingStream?.kill();
      delete this.pausingStream;
    } else {
      this.audioPlayer.unpause();
    }
  }
  /**
   * Emit an event of the voice connection.
   *
   * The special `"error"` event never crashes the process when there is no
   * listener for it, even when the voice connection is used outside of a
   * {@link Queue}.
   * @param event - The event name
   * @param args  - The event arguments
   * @returns `true` when the event had listeners, `false` otherwise
   */
  override emit<U extends keyof DisTubeVoiceEvents>(event: U, ...args: Parameters<DisTubeVoiceEvents[U]>): boolean {
    if (event === "error" && this.listenerCount("error") === 0) {
      handleUnhandledError(args[0] as Error, this.voices.options?.unhandledError ?? "log");
      return false;
    }
    return super.emit(event, ...args);
  }

  /**
   * Start the timer that detects a track stuck in the "buffering" state.
   *
   * When the track does not start playing within
   * {@link DisTubeOptions.stuckThreshold} milliseconds, it is reported as an error
   * so that the queue can skip it.
   */
  #startStuckTimer() {
    const threshold = this.voices.options.stuckThreshold;
    if (typeof threshold !== "number" || threshold <= 0) return;
    this.#clearStuckTimer();
    this.#stuckTimer = setTimeout(() => {
      this.#stuckTimer = undefined;
      if (this.emittedError) return;
      this.emittedError = true;
      this.emit("error", new DisTubeError("TRACK_STUCK"));
    }, threshold);
    this.#stuckTimer.unref?.();
  }
  /**
   * Clear the stuck-track detection timer.
   */
  #clearStuckTimer() {
    if (!this.#stuckTimer) return;
    clearTimeout(this.#stuckTimer);
    this.#stuckTimer = undefined;
  }
  /**
   * Whether the bot is self-deafened
   */
  get selfDeaf(): boolean {
    return this.connection.joinConfig.selfDeaf;
  }
  /**
   * Whether the bot is self-muted
   */
  get selfMute(): boolean {
    return this.connection.joinConfig.selfMute;
  }
  /**
   * Self-deafens/undeafens the bot.
   * @param selfDeaf - Whether or not the bot should be self-deafened
   * @returns true if the voice state was successfully updated, otherwise false
   * @throws {@link DisTubeError} When the value is not a boolean
   */
  setSelfDeaf(selfDeaf: boolean): boolean {
    if (typeof selfDeaf !== "boolean") {
      throw new DisTubeError("INVALID_TYPE", "boolean", selfDeaf, "selfDeaf");
    }
    return this.connection.rejoin({
      ...this.connection.joinConfig,
      selfDeaf,
    });
  }
  /**
   * Self-mutes/unmutes the bot.
   * @param selfMute - Whether or not the bot should be self-muted
   * @returns true if the voice state was successfully updated, otherwise false
   * @throws {@link DisTubeError} When the value is not a boolean
   */
  setSelfMute(selfMute: boolean): boolean {
    if (typeof selfMute !== "boolean") {
      throw new DisTubeError("INVALID_TYPE", "boolean", selfMute, "selfMute");
    }
    return this.connection.rejoin({
      ...this.connection.joinConfig,
      selfMute,
    });
  }
  /**
   * The voice state of this connection
   */
  get voiceState(): VoiceState | undefined {
    return this.channel?.guild?.members?.me?.voice;
  }
}
