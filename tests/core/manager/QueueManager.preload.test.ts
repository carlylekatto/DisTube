import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DisTubeStream, Events, Queue, QueueManager, type Song } from "@";

/**
 * Simulated stream mimicking the lifecycle of the real DisTubeStream: it is
 * an EventEmitter that can be killed, so preloading/playback flows can be
 * asserted without any real FFmpeg or network interaction.
 */
class FakeStream extends EventEmitter {
  readonly url: string;
  #killed = false;
  kill = vi.fn(() => {
    this.#killed = true;
  });
  spawn = vi.fn();
  get killed() {
    return this.#killed;
  }
  constructor(url: string) {
    super();
    this.url = url;
  }
}

const streams: FakeStream[] = [];

vi.mock("@/core/DisTubeStream", () => ({
  DisTubeStream: vi.fn(function (this: any, url: string) {
    const stream = new FakeStream(url);
    streams.push(stream);
    return stream;
  }),
  checkFFmpeg: vi.fn(),
}));

describe("QueueManager preloading (playback simulation)", () => {
  /**
   * Simulated playback session: a queue with 3 songs whose stream info
   * resolves to `https://example.com/<song id>` without any real stream.
   * The voice is positioned 11s from the end of the current song, inside
   * the default preloading window (threshold = 15s).
   */
  const createSimulatedQueue = (optionOverrides = {}) => {
    const mockDisTube: Record<string, any> = {
      options: {
        emitNewSongOnly: false,
        savePreviousSongs: true,
        preload: { enabled: true, threshold: 15 },
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
      playbackTime: 89,
    };
    const queue = new Queue(mockDisTube as any, voice as unknown as any);
    const song1 = { id: "song-1", duration: 100, stream: {} } as Song;
    const song2 = { id: "song-2", duration: 100, stream: {} } as Song;
    const song3 = { id: "song-3", duration: 100, stream: {} } as Song;
    queue.songs = [song1, song2, song3];

    return { mockDisTube, queueManager, queue, voice, song1, song2, song3 };
  };

  const asFake = (stream: unknown) => stream as unknown as FakeStream;

  describe("song transitions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      streams.length = 0;
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("plays the next song with the preloaded stream instead of resolving it again", async () => {
      const { mockDisTube, queueManager, queue, voice, song1, song2 } = createSimulatedQueue();

      // Play the current song: resolved on demand, then the manager starts
      // preloading the next song (it is inside the threshold window).
      await queueManager.playSong(queue);
      const playbackStream = asFake(voice.play.mock.calls[0][0]);
      expect(playbackStream).toBe(streams[0]);
      expect(mockDisTube.emit).toHaveBeenCalledWith(Events.PLAY_SONG, queue, song1);

      // Simulate the waiting period until the preloading finishes
      await queueManager.preloadNextSong(queue);
      expect(queue._preloadedSong).toBe(song2);
      const preloadedStream = asFake(queue._preloadedStream);
      expect(preloadedStream).not.toBe(playbackStream);
      expect(preloadedStream.killed).toBe(false);
      expect(mockDisTube.emit).toHaveBeenCalledWith(Events.PRELOADED_SONG, queue, song2);

      // The song finishes: the queue shifts and song2 is played through the
      // exact stream object that was prepared before song1 ended.
      await queueManager.handleSongFinish(queue);

      expect(voice.play).toHaveBeenLastCalledWith(preloadedStream);
      expect(queue.songs[0]).toBe(song2);
      expect(mockDisTube.emit).toHaveBeenCalledWith(Events.PLAY_SONG, queue, song2);
    });

    it("keeps preloading across consecutive transitions", async () => {
      const { mockDisTube, queueManager, queue, voice, song2, song3 } = createSimulatedQueue();

      await queueManager.playSong(queue);
      await queueManager.preloadNextSong(queue);
      await queueManager.handleSongFinish(queue);
      expect(queue.songs[0]).toBe(song2);

      // Starting song2 re-scheduled the preload of song3; wait for it.
      await queueManager.preloadNextSong(queue);
      expect(queue._preloadedSong).toBe(song3);
      const preloadedStream = asFake(queue._preloadedStream);

      await queueManager.handleSongFinish(queue);

      expect(voice.play).toHaveBeenLastCalledWith(preloadedStream);
      expect(mockDisTube.emit).toHaveBeenCalledWith(Events.PLAY_SONG, queue, song3);
    });

    it("does not leak the preloaded stream when the next song is removed", async () => {
      const { queueManager, queue, voice, song2 } = createSimulatedQueue();

      await queueManager.playSong(queue);
      await queueManager.preloadNextSong(queue);
      const preloadedStream = asFake(queue._preloadedStream);

      // The user removed the song that was being preloaded
      queue.songs.splice(1, 1);

      await queueManager.playSong(queue);

      // The preloaded state was invalidated before the re-resolution
      expect(preloadedStream.killed).toBe(true);
      expect(queue._preloadedSong).not.toBe(song2);
      expect(queue._preloadedStream).not.toBe(preloadedStream);

      // The current song was played through a brand new stream
      const replayedStream = asFake(voice.play.mock.calls.at(-1)![0]);
      expect(replayedStream).not.toBe(preloadedStream);
      expect(voice.play).toHaveBeenLastCalledWith(replayedStream);
    });
  });

  describe("queue changes while a preload is running", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      streams.length = 0;
    });

    it("discards the preload when the next song is replaced while the stream info is resolving", async () => {
      const { mockDisTube, queueManager, queue } = createSimulatedQueue();

      // Block only the second resolution (song2's preload), the playback of
      // song1 must still complete normally.
      let calls = 0;
      let release!: () => void;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      mockDisTube.handler.attachStreamInfo.mockImplementation(async (song: Song) => {
        song.stream = { ...song.stream, playFromSource: true, url: `https://example.com/${song.id}` };
        if (++calls === 2) await gate;
      });

      await queueManager.playSong(queue);
      const pendingPreload = queueManager.preloadNextSong(queue);

      // While song2's stream info is resolving, the user queues a new song
      // right after the playing one: it becomes the actual next song.
      const replacement = { id: "replacement", stream: {} } as Song;
      queue.addToQueue(replacement, 1);

      release();
      await pendingPreload;

      // Nothing was stored and no preloading stream was ever created
      expect(queue._preloadedSong).toBeUndefined();
      expect(queue._preloadedStream).toBeUndefined();
      expect(DisTubeStream).toHaveBeenCalledTimes(1); // only song1's playback stream
      expect(streams[0].killed).toBe(false);
    });

    it("runs concurrent preload requests exactly once", async () => {
      const { mockDisTube, queueManager, queue, song2 } = createSimulatedQueue();

      await queueManager.playSong(queue);
      // playSong already fired a preload internally; two explicit requests
      // now race with it. They must all observe the same single task.
      const [a, b] = await Promise.all([queueManager.preloadNextSong(queue), queueManager.preloadNextSong(queue)]);

      expect(a).toBe(b);
      expect(queue._preloadedSong).toBe(song2);
      // One playback stream + one preloading stream, no duplicates
      expect(DisTubeStream).toHaveBeenCalledTimes(2);
      // song2's stream info was resolved a single time
      expect(mockDisTube.handler.attachStreamInfo).toHaveBeenCalledTimes(2); // song1 + song2
    });
  });

  describe("scheduled preloading", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      streams.length = 0;
      vi.useFakeTimers();
    });

    it("prepares the next song through the timer once the threshold window is reached", async () => {
      const { mockDisTube, queueManager, queue, song2 } = createSimulatedQueue();
      (queue.voice as any).playbackTime = 0; // remaining = 100 - 0 = 100s > threshold (15s)

      await queueManager.playSong(queue);
      expect(queue._preloadTimeout).toBeDefined();
      expect(queue._preloadedSong).toBeUndefined();

      const spy = vi.spyOn(queueManager, "preloadNextSong");
      await vi.advanceTimersByTimeAsync(85_000); // exactly remaining - threshold

      expect(spy).toHaveBeenCalledWith(queue);
      expect(queue._preloadTimeout).toBeUndefined();
      expect(queue._preloadedSong).toBe(song2);
      expect(asFake(queue._preloadedStream).killed).toBe(false);
      expect(mockDisTube.emit).toHaveBeenCalledWith(Events.PRELOAD_SONG, queue, song2);
      expect(mockDisTube.emit).toHaveBeenCalledWith(Events.PRELOADED_SONG, queue, song2);
    });
  });
});
