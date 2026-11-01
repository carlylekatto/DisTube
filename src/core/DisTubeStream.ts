import type { ChildProcess } from "node:child_process";
import { spawn, spawnSync } from "node:child_process";
import type { TransformCallback } from "node:stream";
import { Transform } from "node:stream";
import type { AudioResource } from "@discordjs/voice";
import { createAudioResource, StreamType } from "@discordjs/voice";
import { TypedEmitter } from "tiny-typed-emitter";
import { AUDIO_CHANNELS, AUDIO_SAMPLE_RATE, DEFAULT_CROSSFADE_CURVE } from "../constant";
import type { DisTube } from "../DisTube";
import { DisTubeError } from "../struct/DisTubeError";
import type { Awaitable, FFmpegArg, FFmpegOptions } from "../type";
import { Events } from "../type";

/**
 * Options for {@link DisTubeStream}
 */
export interface StreamOptions {
  /**
   * FFmpeg options
   */
  ffmpeg: FFmpegOptions;
  /**
   * Seek time (in seconds).
   * @default 0
   */
  seek?: number;
  /**
   * Crossfade transition options.
   *
   * When set, the stream mixes the primary URL (the song that is fading out,
   * seeked to its final `duration` seconds) and the secondary URL (the song
   * that is fading in) with an FFmpeg `acrossfade` filter graph, so the two
   * songs crossfade seamlessly in a single FFmpeg process.
   */
  crossfade?: CrossfadeStreamOptions;
}

/**
 * Options describing a crossfade transition stream
 */
export interface CrossfadeStreamOptions {
  /**
   * The fade duration in seconds.
   */
  duration: number;
  /**
   * The initial seek of the first (fading out) input, in seconds. It must be
   * the position where the fade window begins (`song duration - duration`).
   */
  primarySeek: number;
  /**
   * The stream URL of the second (fading in) input.
   */
  secondaryUrl: string;
  /**
   * The FFmpeg `acrossfade` fade curve of the first (fading out) input.
   * @default "qsin"
   */
  outCurve?: string;
  /**
   * The FFmpeg `acrossfade` fade curve of the second (fading in) input.
   * @default "qsin"
   */
  inCurve?: string;
  /**
   * FFmpeg input options of the first (fading out) input. When set, they
   * replace the default input options, which are tuned for http(s) streaming
   * urls. Use it for inputs that need different flags — a local playlist
   * file, for example, requires the `protocol_whitelist` option and no
   * reconnect flags.
   */
  primaryInputArgs?: FFmpegArg;
}

let checked = process.env.NODE_ENV === "test";
/**
 * Check that FFmpeg is installed and can be spawned.
 *
 * The check is only done once: the result is cached.
 * @param distube - The DisTube instance
 * @returns Nothing
 * @throws {@link DisTubeError} When FFmpeg cannot be spawned
 */
export const checkFFmpeg = (distube: DisTube) => {
  if (checked) return;
  const path = distube.options.ffmpeg.path;
  const debug = (str: string) => distube.emit(Events.FFMPEG_DEBUG, str);
  try {
    debug(`[test] spawn ffmpeg at '${path}' path`);
    const process = spawnSync(path, ["-h"], {
      windowsHide: true,
      encoding: "utf-8",
    });
    if (process.error) throw process.error;
    if (process.stderr && !process.stdout) throw new Error(process.stderr);

    const result = process.output.join("\n");
    const version = /ffmpeg version (\S+)/iu.exec(result)?.[1];
    if (!version) throw new Error("Invalid FFmpeg version");
    debug(`[test] ffmpeg version: ${version}`);
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? (e.stack ?? e.message) : String(e);
    debug(`[test] failed to spawn ffmpeg at '${path}': ${errorMessage}`);
    throw new DisTubeError("FFMPEG_NOT_INSTALLED", path);
  }
  checked = true;
};

/**
 * Create a stream to play with {@link DisTubeVoice}
 */
export class DisTubeStream extends TypedEmitter<{
  debug: (debug: string) => Awaitable;
  error: (error: Error) => Awaitable;
}> {
  #ffmpegPath: string;
  #opts: string[];
  /**
   * The FFmpeg process that decodes the audio.
   *
   * It is `undefined` until {@link DisTubeStream#spawn} is called.
   */
  process?: ChildProcess;
  /**
   * The stream of the decoded audio, with the volume applied to it.
   */
  stream: VolumeTransformer;
  /**
   * The Discord.js audio resource that is played by the audio player.
   */
  audioResource: AudioResource;
  /**
   * The seek time in seconds that this stream started from
   */
  readonly seekTime: number;
  /**
   * Whether FFmpeg has already produced audio that is waiting to be read.
   *
   * The stream is spawned ahead of the playback (crossfade warmup) and the
   * pipe backs up once its buffers are full, so this is `true` as soon as the
   * first frame exists. A stream that is still `false` at playback time would
   * leave the audio player buffering until FFmpeg catches up.
   */
  get hasBufferedAudio(): boolean {
    return this.stream.readableLength > 0;
  }
  /**
   * Create a DisTubeStream to play with {@link DisTubeVoice}
   * @param url     - Stream URL
   * @param options - Stream options
   */
  constructor(url: string, options: StreamOptions) {
    super();
    const { ffmpeg, seek, crossfade } = options;
    this.seekTime = typeof seek === "number" && seek > 0 ? seek : 0;
    this.#ffmpegPath = ffmpeg.path;
    this.#opts = crossfade ? this.#crossfadeArgs(url, ffmpeg, crossfade) : this.#singleInputArgs(url, ffmpeg, seek);

    this.stream = new VolumeTransformer();
    this.stream
      .on("close", () => this.kill())
      .on("error", err => {
        this.debug(`[stream] error: ${err.message}`);
        this.emit("error", err);
      })
      .on("finish", () => this.debug("[stream] log: stream finished"));

    this.audioResource = createAudioResource(this.stream, {
      inputType: StreamType.Raw,
      inlineVolume: false,
    });
  }

  #flattenArgs(args: FFmpegArg): string[] {
    return Object.entries(args)
      .flatMap(([key, value]) =>
        Array.isArray(value)
          ? value.filter(Boolean).map(v => [`-${key}`, String(v)])
          : value == null || value === false
            ? []
            : [value === true ? `-${key}` : [`-${key}`, String(value)]],
      )
      .flat();
  }

  /**
   * Translate a `file:` URL into a local filesystem path that FFmpeg accepts.
   *
   * `file:///C:/x` loses its drive-letter leading slash on Windows (`C:/x`),
   * UNC shares keep their `//host` prefix, POSIX paths stay untouched, and
   * other protocols return `undefined`.
   */
  #localPath(url: string): string | undefined {
    const fileUrl = new URL(url);
    if (fileUrl.protocol !== "file:") return undefined;
    const pathname = decodeURIComponent(fileUrl.pathname);
    if (fileUrl.hostname) return `//${fileUrl.hostname}${pathname}`;
    return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
  }

  #singleInputArgs(url: string, ffmpeg: FFmpegOptions, seek?: number): string[] {
    const opts: FFmpegArg = {
      reconnect: 1,
      reconnect_streamed: 1,
      reconnect_delay_max: 5,
      analyzeduration: 0,
      hide_banner: true,
      ...ffmpeg.args.global,
      ...ffmpeg.args.input,
      i: url,
      ar: AUDIO_SAMPLE_RATE,
      ac: AUDIO_CHANNELS,
      ...ffmpeg.args.output,
      f: "s16le",
    };

    if (typeof seek === "number" && seek > 0) opts.ss = seek.toString();

    const localPath = this.#localPath(url);
    if (localPath !== undefined) {
      opts.reconnect = null;
      opts.reconnect_streamed = null;
      opts.reconnect_delay_max = null;
      opts.i = localPath;
    }

    return [...this.#flattenArgs(opts), "pipe:1"];
  }

  /**
   * Build the arguments of a crossfade transition stream: a single FFmpeg
   * process with two inputs (the fading out song seeked to its final
   * `duration` seconds and the fading in song from its beginning) mixed by an
   * `acrossfade` filter graph.
   *
   * Both inputs are normalized (48kHz stereo s16) before the fade, and the
   * queue's `af` filter chain, when present, is folded into the filter complex
   * after the fade (FFmpeg cannot combine `-af` with `-filter_complex`).
   */
  #crossfadeArgs(url: string, ffmpeg: FFmpegOptions, crossfade: CrossfadeStreamOptions): string[] {
    const {
      duration,
      primarySeek,
      secondaryUrl,
      outCurve = DEFAULT_CROSSFADE_CURVE,
      inCurve = DEFAULT_CROSSFADE_CURVE,
    } = crossfade;
    // The `af` output argument cannot coexist with filter_complex: move it to
    // the end of the filter graph instead.
    const outputArgs: FFmpegArg = { ...ffmpeg.args.output };
    const extraFilters =
      typeof outputArgs.af === "string"
        ? outputArgs.af
        : Array.isArray(outputArgs.af)
          ? outputArgs.af.filter(Boolean).join(",")
          : undefined;
    delete outputArgs.af;

    const primaryOpts: FFmpegArg = {
      hide_banner: true,
      ...ffmpeg.args.global,
      ...(crossfade.primaryInputArgs ?? {
        reconnect: 1,
        reconnect_streamed: 1,
        reconnect_delay_max: 5,
        analyzeduration: 0,
        ...ffmpeg.args.input,
      }),
      ss: typeof primarySeek === "number" && primarySeek > 0 ? primarySeek.toString() : null,
      i: url,
    };
    const secondaryOpts: FFmpegArg = {
      reconnect: 1,
      reconnect_streamed: 1,
      reconnect_delay_max: 5,
      analyzeduration: 0,
      ...ffmpeg.args.input,
      i: secondaryUrl,
    };

    // File inputs need the reconnect flags dropped and a plain local path
    // (also for the fading-in input, not only the primary one).
    const primaryLocal = this.#localPath(url);
    if (primaryLocal !== undefined) {
      primaryOpts.reconnect = null;
      primaryOpts.reconnect_streamed = null;
      primaryOpts.reconnect_delay_max = null;
      primaryOpts.i = primaryLocal;
    }
    const secondaryLocal = this.#localPath(secondaryUrl);
    if (secondaryLocal !== undefined) {
      secondaryOpts.reconnect = null;
      secondaryOpts.reconnect_streamed = null;
      secondaryOpts.reconnect_delay_max = null;
      secondaryOpts.i = secondaryLocal;
    }

    const normalize = `aresample=${AUDIO_SAMPLE_RATE},aformat=sample_fmts=s16:channel_layouts=stereo`;
    const fade = `[a0][a1]acrossfade=d=${duration}:c1=${outCurve}:c2=${inCurve}[xf]`;
    const graph = [
      `[0:a]${normalize}[a0]`,
      `[1:a]${normalize}[a1]`,
      fade,
      ...(extraFilters ? [`[xf]${extraFilters}[aout]`] : []),
    ].join(";");

    const outputOpts: FFmpegArg = {
      ar: AUDIO_SAMPLE_RATE,
      ac: AUDIO_CHANNELS,
      ...outputArgs,
      filter_complex: graph,
      map: extraFilters ? "[aout]" : "[xf]",
      f: "s16le",
    };

    return [
      ...this.#flattenArgs(primaryOpts),
      ...this.#flattenArgs(secondaryOpts),
      ...this.#flattenArgs(outputOpts),
      "pipe:1",
    ];
  }

  /**
   * Spawn the FFmpeg process that decodes the audio.
   * @returns Nothing
   * @throws {Error} When the FFmpeg process cannot be created
   */
  spawn() {
    this.debug(`[process] spawn: ${this.#ffmpegPath} ${this.#opts.join(" ")}`);
    this.process = spawn(this.#ffmpegPath, this.#opts, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    })
      .on("error", err => {
        this.debug(`[process] error: ${err.message}`);
        this.emit("error", err);
      })
      .on("exit", (code, signal) => {
        this.debug(`[process] exit: code=${code ?? "unknown"} signal=${signal ?? "unknown"}`);
        if (!code || [0, 255].includes(code)) return;
        this.debug(`[process] error: ffmpeg exited with code ${code}`);
        this.emit("error", new DisTubeError("FFMPEG_EXITED", code));
      });

    if (!this.process.stdout || !this.process.stderr) {
      this.kill();
      throw new Error("Failed to create ffmpeg process");
    }

    this.process.stdout.pipe(this.stream);
    this.process.stderr.setEncoding("utf8")?.on("data", (data: string) => {
      const lines = data.split(/\r\n|\r|\n/u);
      for (const line of lines) {
        if (/^\s*$/.test(line)) continue;
        this.debug(`[ffmpeg] log: ${line}`);
      }
    });
  }

  private debug(debug: string) {
    this.emit("debug", debug);
  }

  /**
   * Set the volume of the stream.
   * @param volume - The volume of the stream, between `0` and `1`
   * @returns Nothing
   */
  setVolume(volume: number) {
    this.stream.vol = volume;
  }

  /**
   * Kill the FFmpeg process and destroy the stream.
   * @returns Nothing
   */
  kill() {
    if (!this.stream.destroyed) this.stream.destroy();
    if (this.process && !this.process.killed) this.process.kill("SIGKILL");
  }
}

// Based on prism-media
class VolumeTransformer extends Transform {
  private buffer = Buffer.allocUnsafe(0);
  private readonly extrema = [-(2 ** (16 - 1)), 2 ** (16 - 1) - 1];
  vol = 1;

  override _transform(newChunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    const { vol } = this;
    if (vol === 1) {
      this.push(newChunk);
      done();
      return;
    }

    const bytes = 2;
    const chunk = Buffer.concat([this.buffer, newChunk]);
    const readableLength = Math.floor(chunk.length / bytes) * bytes;

    for (let i = 0; i < readableLength; i += bytes) {
      const value = chunk.readInt16LE(i);
      const clampedValue = Math.min(this.extrema[1], Math.max(this.extrema[0], value * vol));
      chunk.writeInt16LE(clampedValue, i);
    }

    this.buffer = chunk.subarray(readableLength);
    this.push(chunk.subarray(0, readableLength));
    done();
  }
}
