import { beforeEach, describe, expect, it, vi } from "vitest";
import { DisTubeStream } from "@";

// Mock child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    stdout: {
      pipe: vi.fn(),
    },
    stderr: {
      setEncoding: vi.fn().mockReturnThis(),
      on: vi.fn().mockReturnThis(),
    },
    killed: false,
    kill: vi.fn(),
  })),
  spawnSync: vi.fn(() => ({
    error: null,
    stdout: "ffmpeg version 5.0",
    stderr: "",
    output: ["", "ffmpeg version 5.0", ""],
  })),
}));

// Mock @discordjs/voice
vi.mock("@discordjs/voice", async importOriginal => {
  const original = await importOriginal<typeof import("@discordjs/voice")>();
  return {
    ...original,
    createAudioResource: vi.fn(() => ({
      playbackDuration: 0,
    })),
  };
});

describe("DisTubeStream crossfade", () => {
  const ffmpegOptions = {
    ffmpeg: {
      path: "ffmpeg",
      args: {
        global: {},
        input: {},
        output: {},
      },
    },
  };

  const crossfadeOptions = {
    duration: 6,
    primarySeek: 94,
    secondaryUrl: "https://example.com/next",
  };

  const spawnArgs = async (options: object) => {
    const { spawn } = await import("node:child_process");
    const stream = new DisTubeStream("https://example.com/current", options as any);
    stream.spawn();
    const call = vi.mocked(spawn).mock.calls.at(-1)!;
    return [call[0], call[1] as string[]] as const;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a two-input filter_complex with an acrossfade graph", async () => {
    const [cmd, args] = await spawnArgs({ ...ffmpegOptions, crossfade: crossfadeOptions });

    expect(cmd).toBe("ffmpeg");
    // Two inputs: the fading-out song and the fading-in song
    const i1 = args.indexOf("-i");
    const i2 = args.indexOf("-i", i1 + 1);
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
    expect(args[i1 + 1]).toBe("https://example.com/current");
    expect(args[i2 + 1]).toBe("https://example.com/next");
    // The primary seek applies to the first input only
    const ss = args.indexOf("-ss");
    expect(ss).toBeGreaterThan(-1);
    expect(ss).toBeLessThan(i1);
    expect(args[ss + 1]).toBe("94");
    expect(args.indexOf("-ss", ss + 1)).toBe(-1);
    // Normalization + fade graph
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toBe(
      "[0:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo[a0];" +
        "[1:a]aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo[a1];" +
        "[a0][a1]acrossfade=d=6:c1=qsin:c2=qsin[xf]",
    );
    // No extra filters: the fade output is mapped directly
    expect(args[args.indexOf("-map") + 1]).toBe("[xf]");
    // Raw PCM output
    expect(args.at(-1)).toBe("pipe:1");
    expect(args[args.lastIndexOf("-f") + 1]).toBe("s16le");
  });

  it("folds the `af` output filters into the filter complex", async () => {
    const options = {
      ...ffmpegOptions,
      ffmpeg: {
        ...ffmpegOptions.ffmpeg,
        args: { global: {}, input: {}, output: { af: "bass=g=5" } },
      },
      crossfade: crossfadeOptions,
    };
    const [, args] = await spawnArgs(options);

    expect(args.indexOf("-af")).toBe(-1);
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph.endsWith(";[xf]bass=g=5[aout]")).toBe(true);
    expect(args[args.indexOf("-map") + 1]).toBe("[aout]");
  });

  it("supports custom fade curves", async () => {
    const [, args] = await spawnArgs({
      ...ffmpegOptions,
      crossfade: { ...crossfadeOptions, inCurve: "tri", outCurve: "esin" },
    });
    const graph = args[args.indexOf("-filter_complex") + 1];
    expect(graph).toContain("acrossfade=d=6:c1=esin:c2=tri");
  });

  it("replaces the primary input options with primaryInputArgs", async () => {
    const [, args] = await spawnArgs({
      ...ffmpegOptions,
      crossfade: {
        ...crossfadeOptions,
        primarySeek: 3,
        primaryInputArgs: {
          analyzeduration: 0,
          protocol_whitelist: "file,http,https,tcp,tls,crypto",
        },
      },
    });
    // The primary input is the local playlist with the adapter's options
    const i1 = args.indexOf("-i");
    expect(args[i1 + 1]).toBe("https://example.com/current");
    // No streaming-specific options on the replaced input
    expect(args.slice(0, i1).indexOf("-reconnect")).toBe(-1);
    expect(args.indexOf("-protocol_whitelist")).toBeGreaterThan(-1);
    expect(args.indexOf("-protocol_whitelist")).toBeLessThan(i1);
    expect(args[args.indexOf("-protocol_whitelist") + 1]).toBe("file,http,https,tcp,tls,crypto");
    // The seek still applies to the first input only
    const ss = args.indexOf("-ss");
    expect(ss).toBeGreaterThan(-1);
    expect(ss).toBeLessThan(i1);
    expect(args[ss + 1]).toBe("3");
    // The secondary input keeps the default streaming options
    const i2 = args.indexOf("-i", i1 + 1);
    expect(args.indexOf("-reconnect")).toBeGreaterThan(-1);
    expect(args.indexOf("-reconnect")).toBeLessThan(i2);
  });

  it("converts a file url primary input into a plain local path", async () => {
    const { spawn } = await import("node:child_process");
    const stream = new DisTubeStream("file:///tmp/coz-xf-tail.m3u8", {
      ...ffmpegOptions,
      crossfade: {
        duration: 6,
        primarySeek: 3,
        secondaryUrl: "https://example.com/next",
        primaryInputArgs: { analyzeduration: 0, protocol_whitelist: "file,http,https,tcp,tls,crypto" },
      },
    });
    stream.spawn();
    const call = vi.mocked(spawn).mock.calls.at(-1)!;
    const args = call[1] as string[];
    const i1 = args.indexOf("-i");
    // file:// urls are translated so that FFmpeg accepts them everywhere
    expect(args[i1 + 1]).toBe("/tmp/coz-xf-tail.m3u8");
    // No streaming-specific option on the replaced (file) input
    expect(args.slice(0, i1).indexOf("-reconnect")).toBe(-1);
    const i2 = args.indexOf("-i", i1 + 1);
    // The secondary input keeps the default streaming options
    expect(args.indexOf("-reconnect")).toBeGreaterThan(i1);
    expect(args.indexOf("-reconnect")).toBeLessThan(i2);
    expect(args.indexOf("-protocol_whitelist")).toBeGreaterThan(-1);
    expect(args.indexOf("-protocol_whitelist")).toBeLessThan(i1);
    expect(args[args.indexOf("-protocol_whitelist") + 1]).toBe("file,http,https,tcp,tls,crypto");
  });

  it("does not use a seek time after the swap", async () => {
    const stream = new DisTubeStream("https://example.com/current", { ...ffmpegOptions, crossfade: crossfadeOptions });
    // The -ss of the transition belongs to the first input: the playback time
    // of the played resource must follow the second (new) song.
    expect(stream.seekTime).toBe(0);
  });

  it("keeps the single-input behavior without crossfade options", async () => {
    const [, args] = await spawnArgs({ ...ffmpegOptions, seek: 30 });
    expect(args.filter(a => a === "-i")).toHaveLength(1);
    expect(args.indexOf("-filter_complex")).toBe(-1);
    expect(args[args.indexOf("-ss") + 1]).toBe("30");
  });
});
