import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Events, Queue, QueueManager, type Song } from "@";

/**
 * Simulated stream mimicking the lifecycle of the real DisTubeStream: it is
 * an EventEmitter that can be spawned (warm-up) and killed, so crossfade
 * flows can be asserted without any real FFmpeg or network interaction.
 */
class FakeStream extends EventEmitter {
  readonly url: string;
  readonly options: { crossfade?: Record<string, unknown> };
  /** Mirrors `DisTubeStream#hasBufferedAudio`: a warmed-up stream is ready. */
  hasBufferedAudio = true;
  #killed = false;
  kill = vi.fn(() => {
    this.#killed = true;
  });
  spawn = vi.fn();
  get killed() {
    return this.#killed;
  }
  constructor(url: string, options?: { crossfade?: Record<string, unknown> }) {
    super();
    this.url = url;
    this.options = options ?? {};
  }
}

const streams: FakeStream[] = [];

vi.mock("@/core/DisTubeStream", () => ({
  DisTubeStream: vi.fn(function (this: any, url: string, options: { crossfade?: Record<string, unknown> }) {
    const stream = new FakeStream(url, options);
    streams.push(stream);
    return stream;
  }),
  checkFFmpeg: vi.fn(),
}));

describe("QueueManager crossfade (playback simulation)", () => {
  /**
   * Simulated playback session: a queue whose songs resolve to
   * `https://example.com/<song id>` without any real stream.
   */
  const createSimulatedQueue = (optionOverrides = {}) => {
    const mockDisTube: Record<string, any> = {
      options: {
        emitNewSongOnly: false,
        savePreviousSongs: true,
        preload: { enabled: true, threshold: 15 },
        crossfade: { duration: 0, curve: "qsin", warmup: 5 },
        ffmpeg: { path: "ffmpeg", args: { global: {}, input: {}, output: {} } },
        ...optionOverrides,
      },
      emit: vi.fn(),
      debug: vi.fn(),
      handler: {
        attachStreamInfo: vi.fn(async (song: Song) => {
          song.stream = { ...song.stream, playFromSource: true, url: `https://example.com/${song.id}` };
        }),
      },
      voices: { create: vi.fn() },
    };
    const queueManager = new QueueManager(mockDisTube as any);
    const voice = {
      id: "123456789012345678",
      stop: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      unpause: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      playbackTime: 79,
    };
    const queue = new Queue(mockDisTube as any, voice as unknown as any);
    mockDisTube.queues = queueManager;
    const song1 = { id: "song-1", duration: 100, stream: {} } as Song;
    const song2 = { id: "song-2", duration: 100, stream: {} } as Song;
    const song3 = { id: "song-3", duration: 100, stream: {} } as Song;
    queue.songs = [song1, song2, song3];

    return { mockDisTube, queueManager, queue, voice, song1, song2, song3 };
  };

  const asFake = (stream: unknown) => stream as unknown as FakeStream;

  describe("crossfade transitions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      streams.length = 0;
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("crossfades into the next song exactly at the fade boundary", async () => {
      const { mockDisTube, queueManager, queue, voice, song1, song2 } = createSimulatedQueue();
      queue.crossfade = 6;

      // Start song1 at 79s: remaining = 21s, fade = 6s → warm-up in 10s.
      await queueManager.playSong(queue);
      // A new resource starts its playback from zero (simulated): this keeps
      // the post-swap scheduleCrossfade timers realistic.
      voice.play.mockImplementation(async () => {
        (voice as any).playbackTime = 0;
      });
      expect(queue._crossfadeTimeout).toBeDefined();

      // The warm-up timer fires: the transition stream is spawned early and
      // parked on the queue, with the boundary timer armed.
      // streams[1] is the plain preloaded stream of song2 (from the
      // scheduler); streams[2] is the merged transition stream.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(streams).toHaveLength(3);
      const preloaded = asFake(streams[1]);
      const transition = asFake(queue._crossfadeWarmup);
      expect(transition).toBe(streams[2]);
      expect(transition.spawn).toHaveBeenCalled();
      expect(transition.options.crossfade).toMatchObject({
        duration: 6,
        primarySeek: 94,
        secondaryUrl: "https://example.com/song-2",
        inCurve: "qsin",
        outCurve: "qsin",
      });

      // At the boundary (100-6 = 94s), the transition stream replaces the
      // playback and the queue advances like a regular song finish.
      (queue.voice as any).playbackTime = 94;
      const pending = vi.getTimerCount();
      expect(pending).toBe(1);
      await vi.advanceTimersByTimeAsync(15_000);

      expect(voice.play).toHaveBeenLastCalledWith(transition);
      expect(queue.songs[0]).toBe(song2);
      expect(queue.previousSongs).toContain(song1);
      expect(mockDisTube.emit).toHaveBeenCalledWith(Events.FINISH_SONG, queue, song1);
      expect(mockDisTube.emit).toHaveBeenCalledWith(Events.PLAY_SONG, queue, song2);
      // The finished song's stream url is dropped, like a regular transition
      expect((song1.stream as any).url).toBeUndefined();
      // The plain preloaded stream of song2 was killed and replaced by the
      // transition stream.
      expect(preloaded.killed).toBe(true);
      expect(queue._crossfadeWarmup).toBeUndefined();
      // song2 (the new current song, playing from 0s) starts a fresh cycle:
      // the preload of song3 and the next crossfade are both armed by timer
      expect(queue._preloadTimeout).toBeDefined();
      expect(queue._crossfadeTimeout).toBeDefined();
      expect(queue._preloadedSong).toBeUndefined();
      // The transition stream was NOT spawned again by voice.play
      expect(transition.spawn).toHaveBeenCalledTimes(1);
    });

    it("falls back to the regular transition when the warmed-up stream has no audio yet", async () => {
      const { queueManager, queue, voice } = createSimulatedQueue();
      queue.crossfade = 6;

      await queueManager.playSong(queue);
      await vi.advanceTimersByTimeAsync(10_000);
      const transition = asFake(queue._crossfadeWarmup);
      expect(transition.spawn).toHaveBeenCalled();

      // Slow source: FFmpeg has not emitted a single frame by the boundary.
      // Swapping it in would leave the player buffering (and the stuck
      // watchdog would skip the song), so the crossfade must step aside.
      transition.hasBufferedAudio = false;
      (queue.voice as any).playbackTime = 94;
      await vi.advanceTimersByTimeAsync(15_000);

      expect(voice.play).not.toHaveBeenCalledWith(transition);
      expect(transition.killed).toBe(true);
      expect(queue._crossfadeWarmup).toBeUndefined();
      // The queue is untouched: the regular transition still owns the song
      expect(queue.previousSongs).toHaveLength(0);
      expect(queue.songs[0].id).toBe("song-1");
    });

    it("aborts the crossfade when the playback drifts from the fade boundary", async () => {
      const { queueManager, queue, voice } = createSimulatedQueue();
      queue.crossfade = 6;

      await queueManager.playSong(queue);
      await vi.advanceTimersByTimeAsync(10_000);
      const transition = asFake(queue._crossfadeWarmup);

      // The playback is far from the expected boundary (94s): the transition
      // must be aborted and the regular switch must take over.
      (queue.voice as any).playbackTime = 80;
      await vi.advanceTimersByTimeAsync(15_000);

      expect(voice.play).not.toHaveBeenCalledWith(transition);
      expect(transition.killed).toBe(true);
      expect(queue.songs[0]).toBe(queue.songs[0]);
      expect(queue._crossfadeWarmup).toBeUndefined();
      // The queue is untouched: no songs were shifted
      expect(queue.previousSongs).toHaveLength(0);
    });

    it("cancels the crossfade when the queue is paused during the fade window", async () => {
      const { queueManager, queue, voice } = createSimulatedQueue();
      queue.crossfade = 6;

      await queueManager.playSong(queue);
      await vi.advanceTimersByTimeAsync(10_000);
      const transition = asFake(queue._crossfadeWarmup);
      expect(transition.spawn).toHaveBeenCalled();

      await queue.pause();
      expect(transition.killed).toBe(true);
      expect(queue._crossfadeWarmup).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);

      // Nothing happens after the pause, even after the original boundaries
      await vi.advanceTimersByTimeAsync(60_000);
      expect(voice.play).toHaveBeenCalledTimes(1);
      expect(queue.songs[0]).toBe(queue.songs[0]);
    });

    it("re-arms the crossfade when the queue resumes", async () => {
      const { queueManager, queue } = createSimulatedQueue();
      queue.crossfade = 6;
      await queueManager.playSong(queue);
      await vi.advanceTimersByTimeAsync(10_000);

      await queue.pause();
      await queue.resume();
      // remaining = 21s (playbackTime fixture is static): the timer is armed
      // again with the same window
      expect(queue._crossfadeTimeout).toBeDefined();
      await vi.advanceTimersByTimeAsync(10_000);
      const warmup = asFake(queue._crossfadeWarmup);
      expect(warmup.options.crossfade).toBeDefined();
      expect(warmup.spawn).toHaveBeenCalled();
      expect(warmup.options.crossfade).toMatchObject({ duration: 6, secondaryUrl: "https://example.com/song-2" });
    });

    it("fades a repeat-song queue into the same song without shifting it", async () => {
      const { mockDisTube, queueManager, queue, voice, song1 } = createSimulatedQueue();
      queue.crossfade = 6;
      queue.repeatMode = 1; // RepeatMode.SONG
      queue.songs = [song1];

      await queueManager.playSong(queue); // resolves song1's stream url
      await vi.advanceTimersByTimeAsync(10_000);
      const transition = asFake(queue._crossfadeWarmup);
      expect(transition).toBeDefined();
      // Both inputs are the same song (a fresh playback of it)
      expect(transition.options.crossfade).toMatchObject({
        primarySeek: 94,
        secondaryUrl: "https://example.com/song-1",
      });

      (queue.voice as any).playbackTime = 94;
      await vi.advanceTimersByTimeAsync(15_000);

      expect(voice.play).toHaveBeenLastCalledWith(transition);
      expect(queue.songs[0]).toBe(song1);
      expect(queue.previousSongs).toHaveLength(0);
      expect((song1.stream as any).url).toBe("https://example.com/song-1");
      expect(mockDisTube.emit).toHaveBeenCalledWith(Events.PLAY_SONG, queue, song1);
    });

    it("does not schedule a crossfade when disabled, live, or without a next song", async () => {
      const { queueManager, queue: disabledQueue } = createSimulatedQueue();
      await queueManager.playSong(disabledQueue);
      expect(disabledQueue._crossfadeTimeout).toBeUndefined();

      // A song without a known duration (live stream) cannot be crossfaded
      const { queueManager: qm2, queue: liveQueue, song1 } = createSimulatedQueue();
      (song1 as any).duration = 0;
      liveQueue.crossfade = 6;
      await qm2.playSong(liveQueue);
      expect(liveQueue._crossfadeTimeout).toBeUndefined();

      // No up next song (and repeat-song off): nothing to fade into
      const { queueManager: qm3, queue: shortQueue, song1: s1 } = createSimulatedQueue();
      shortQueue.crossfade = 6;
      shortQueue.songs = [s1];
      await qm3.playSong(shortQueue);
      expect(shortQueue._crossfadeTimeout).toBeUndefined();
    });

    it("when the transition stream cannot be built, the regular transition still plays", async () => {
      const { mockDisTube, queueManager, queue, song2 } = createSimulatedQueue();
      queue.crossfade = 6;
      // The next song cannot be resolved (no stream url): warm-up falls back
      mockDisTube.handler.attachStreamInfo.mockImplementation(async (song: Song) => {
        if (song === song2) throw new Error("resolve failed");
        song.stream = { ...song.stream, playFromSource: true, url: `https://example.com/${song.id}` };
      });

      await queueManager.playSong(queue);
      // Best-effort: no crash, nothing parked, nothing armed
      await vi.advanceTimersByTimeAsync(20_000);
      expect(queue._crossfadeWarmup).toBeUndefined();
      expect(queue._crossfadeTimeout).toBeUndefined();
      expect(queue.songs[0]).toBeDefined();
      expect(streams).toHaveLength(1); // only song1's playback stream
    });

    it("lets the adapter replace the fading-out song's input", async () => {
      const { queueManager, queue } = createSimulatedQueue({
        crossfade: {
          duration: 0,
          curve: "qsin",
          warmup: 5,
          preparePrimaryInput: (url: string, { seek }: { seek: number }) => {
            expect(url).toBe("https://example.com/song-1");
            expect(seek).toBe(94);
            return {
              // A playlist trimmed to start from 90s: the fade boundary sits
              // 4s into the replacement input.
              url: "file:///tmp/tail.m3u8",
              seek: 4,
              inputArgs: { protocol_whitelist: "file,http,https,tcp,tls,crypto" },
            };
          },
        },
      });
      queue.crossfade = 6;

      await queueManager.playSong(queue);
      await vi.advanceTimersByTimeAsync(10_000);
      const transition = asFake(queue._crossfadeWarmup);
      expect(transition).toBeDefined();
      expect(transition.url).toBe("file:///tmp/tail.m3u8");
      expect(transition.options.crossfade).toMatchObject({
        primarySeek: 4,
        secondaryUrl: "https://example.com/song-2",
      });
      expect((transition.options as any).crossfade.primaryInputArgs).toEqual({
        protocol_whitelist: "file,http,https,tcp,tls,crypto",
      });
    });

    it("does not crash when the transition stream dies during the warmup", async () => {
      const { queueManager, queue, voice } = createSimulatedQueue();
      queue.crossfade = 6;

      await queueManager.playSong(queue);
      await vi.advanceTimersByTimeAsync(10_000);
      const transition = asFake(queue._crossfadeWarmup);
      expect(transition).toBeDefined();

      // FFmpeg of the transition stream dies (a bad input, for example): the
      // queue must not crash on the unhandled "error" event and keeps the
      // regular transition.
      transition.emit("error", new Error("ffmpeg exited with code 234"));
      expect(queue._crossfadeWarmup).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);

      // Nothing swaps in at the (cleared) boundary
      (queue.voice as any).playbackTime = 94;
      await vi.advanceTimersByTimeAsync(15_000);
      expect(voice.play).not.toHaveBeenCalledWith(transition);
      expect(transition.killed).toBe(true);
      expect(queue.songs[0].id).toBe("song-1");
      expect(queue.previousSongs).toHaveLength(0);
    });

    it("falls back to the original url when the adapter fails", async () => {
      const { mockDisTube, queueManager, queue } = createSimulatedQueue({
        crossfade: {
          duration: 0,
          curve: "qsin",
          warmup: 5,
          preparePrimaryInput: () => {
            throw new Error("adapter unavailable");
          },
        },
      });
      queue.crossfade = 6;

      await queueManager.playSong(queue);
      await vi.advanceTimersByTimeAsync(10_000);
      const transition = asFake(queue._crossfadeWarmup);
      // Best-effort: the plain url is used and the crossfade still happens
      expect(transition).toBeDefined();
      expect(transition.url).toBe("https://example.com/song-1");
      expect(transition.options.crossfade).toMatchObject({ primarySeek: 94 });
      expect(mockDisTube.debug).toHaveBeenCalledWith(expect.stringContaining("primary input preparation failed"));
    });
  });
});
