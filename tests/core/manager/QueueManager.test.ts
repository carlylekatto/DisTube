import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DisTubeError, DisTubeStream, Events, Queue, QueueManager, type Song } from "@";

vi.mock("@/core/DisTubeStream", () => ({
  DisTubeStream: vi.fn(function (this: any) {
    return { on: vi.fn(), kill: vi.fn() };
  }),
  checkFFmpeg: vi.fn(),
}));

describe("QueueManager", () => {
  const createMockDisTube = (overrides = {}) =>
    ({
      options: {
        emitNewSongOnly: false,
        savePreviousSongs: true,
        ffmpeg: { path: "ffmpeg", args: { global: {}, input: {}, output: {} } },
      },
      emit: vi.fn(),
      debug: vi.fn(),
      handler: { attachStreamInfo: vi.fn() },
      voices: { create: vi.fn() },
      ...overrides,
    }) as any;

  const createMockVoice = () =>
    ({
      stop: vi.fn(),
      play: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    }) as any;

  describe("handleSongFinish", () => {
    describe("with _manualUpdate flag", () => {
      it("plays next song without shifting when _manualUpdate is true", async () => {
        const mockDisTube = createMockDisTube();
        const queueManager = new QueueManager(mockDisTube);
        const queue = new Queue(mockDisTube, createMockVoice());
        const song1 = { id: "1", stream: {} } as Song;
        const song2 = { id: "2", stream: {} } as Song;
        queue.songs = [song1, song2];
        queue._manualUpdate = true;

        vi.spyOn(queueManager, "playSong").mockResolvedValue(undefined);

        await queueManager.handleSongFinish(queue);

        expect(queue._manualUpdate).toBe(false);
        expect(queue.songs[0]).toBe(song1);
        expect(queueManager.playSong).toHaveBeenCalledWith(queue);
      });
    });

    describe("natural song finish", () => {
      it("shifts current song and plays next", async () => {
        const mockDisTube = createMockDisTube();
        const queueManager = new QueueManager(mockDisTube);
        const queue = new Queue(mockDisTube, createMockVoice());
        const song1 = { id: "1", stream: {} } as Song;
        const song2 = { id: "2", stream: {} } as Song;
        queue.songs = [song1, song2];
        queue._manualUpdate = false;

        vi.spyOn(queueManager, "playSong").mockResolvedValue(undefined);

        await queueManager.handleSongFinish(queue);

        expect(queue.songs[0]).toBe(song2);
        expect(queue.previousSongs[0]).toBe(song1);
        expect(queueManager.playSong).toHaveBeenCalledWith(queue, true);
      });
    });

    describe("autoplay behavior", () => {
      let mockDisTube: any;
      let queueManager: QueueManager;

      beforeEach(() => {
        mockDisTube = createMockDisTube();
        queueManager = new QueueManager(mockDisTube);
        vi.clearAllMocks();
      });

      it("adds related song when last song finishes with autoplay enabled", async () => {
        const queue = new Queue(mockDisTube, createMockVoice());
        const lastSong = { id: "last", stream: { playFromSource: true } } as Song;
        const relatedSong = { id: "related", stream: {} } as Song;

        queue.songs = [lastSong];
        queue.previousSongs = [];
        queue.autoplay = true;
        queue._manualUpdate = false;

        vi.spyOn(queue, "_addRelatedSong").mockImplementation(async (song?: Song) => {
          expect(song).toBe(lastSong);
          queue.songs.push(relatedSong);
          return relatedSong;
        });
        vi.spyOn(queueManager, "playSong").mockResolvedValue(undefined);

        await queueManager.handleSongFinish(queue);

        expect(queue._addRelatedSong).toHaveBeenCalledWith(lastSong);
        expect(queue.songs).toContain(relatedSong);
        expect(queueManager.playSong).toHaveBeenCalledWith(queue, true);
      });

      it("passes finished song to addRelatedSong even when queue is empty after shift", async () => {
        const queue = new Queue(mockDisTube, createMockVoice());
        const onlySong = { id: "only", stream: { playFromSource: true } } as Song;
        const relatedSong = { id: "related", stream: {} } as Song;

        queue.songs = [onlySong];
        queue.previousSongs = [];
        queue.autoplay = true;
        queue._manualUpdate = false;

        vi.spyOn(queue, "_addRelatedSong").mockImplementation(async (song?: Song) => {
          // Verify queue.songs is empty at this point but we still receive the song
          expect(queue.songs.length).toBe(0);
          expect(song).toBe(onlySong);
          queue.songs.push(relatedSong);
          return relatedSong;
        });
        vi.spyOn(queueManager, "playSong").mockResolvedValue(undefined);

        await queueManager.handleSongFinish(queue);

        expect(queue._addRelatedSong).toHaveBeenCalledWith(onlySong);
        expect(queue.songs[0]).toBe(relatedSong);
      });

      it("emits NO_RELATED event when addRelatedSong fails", async () => {
        const queue = new Queue(mockDisTube, createMockVoice());
        const onlySong = { id: "only", stream: { playFromSource: true } } as Song;

        queue.songs = [onlySong];
        queue.previousSongs = [];
        queue.autoplay = true;
        queue._manualUpdate = false;

        const noRelatedError = new DisTubeError("NO_RELATED");
        vi.spyOn(queue, "_addRelatedSong").mockRejectedValue(noRelatedError);
        vi.spyOn(queue, "remove").mockImplementation(() => {});

        await queueManager.handleSongFinish(queue);

        expect(queue._addRelatedSong).toHaveBeenCalledWith(onlySong);
        expect(mockDisTube.emit).toHaveBeenCalledWith(Events.NO_RELATED, queue, noRelatedError);
        expect(queue.remove).toHaveBeenCalled();
      });

      it("removes queue when autoplay fails and no songs remain", async () => {
        const queue = new Queue(mockDisTube, createMockVoice());
        const onlySong = { id: "only", stream: { playFromSource: true } } as Song;

        queue.songs = [onlySong];
        queue.previousSongs = [];
        queue.autoplay = true;
        queue._manualUpdate = false;

        vi.spyOn(queue, "addRelatedSong").mockRejectedValue(new Error("NO_RELATED"));
        vi.spyOn(queue, "remove").mockImplementation(() => {});

        await queueManager.handleSongFinish(queue);

        expect(queue.remove).toHaveBeenCalled();
        // Should NOT emit FINISH event when autoplay is true
        expect(mockDisTube.emit).not.toHaveBeenCalledWith(Events.FINISH, queue);
      });

      it("emits EMPTY when the queue runs out of songs", async () => {
        const queue = new Queue(mockDisTube, createMockVoice());
        const onlySong = { id: "only", stream: { playFromSource: true } } as Song;

        queue.songs = [onlySong];
        queue.previousSongs = [];
        queue.autoplay = false;
        queue._manualUpdate = false;

        vi.spyOn(queueManager, "playSong").mockResolvedValue(undefined);
        vi.spyOn(queue, "remove").mockImplementation(() => {});

        await queueManager.handleSongFinish(queue);

        expect(mockDisTube.emit).toHaveBeenCalledWith(Events.EMPTY, queue);
        expect(mockDisTube.emit).toHaveBeenCalledWith(Events.FINISH, queue);
      });

      it("does not emit EMPTY while there are still songs left", async () => {
        const queue = new Queue(mockDisTube, createMockVoice());
        const song1 = { id: "1", stream: {} } as Song;
        const song2 = { id: "2", stream: {} } as Song;

        queue.songs = [song1, song2];
        queue.previousSongs = [];
        queue.autoplay = false;
        queue._manualUpdate = false;

        vi.spyOn(queueManager, "playSong").mockResolvedValue(undefined);

        await queueManager.handleSongFinish(queue);

        expect(mockDisTube.emit).not.toHaveBeenCalledWith(Events.EMPTY, queue);
      });
    });
  });

  describe("playSong", () => {
    describe("keepSongOnError", () => {
      it("keeps the current song in the queue when the restart fails", async () => {
        const mockDisTube = createMockDisTube({
          emitError: vi.fn(),
          queues: { remove: vi.fn() },
        });
        const queueManager = new QueueManager(mockDisTube);
        const queue = new Queue(mockDisTube, createMockVoice());
        const song = {
          id: "1",
          duration: 180,
          stream: { playFromSource: true, url: "http://test.com/stream" },
        } as Song;
        queue.songs = [song];

        mockDisTube.handler.attachStreamInfo.mockRejectedValue(new Error("stream unavailable"));

        await queueManager.playSong(queue, false, { keepSongOnError: true });

        expect(queue.songs).toContain(song);
        expect(mockDisTube.emitError).toHaveBeenCalledWith(expect.any(Error), queue, song);
      });

      it("removes the current song from the queue when the playback fails", async () => {
        const mockDisTube = createMockDisTube({
          emitError: vi.fn(),
          queues: { remove: vi.fn() },
        });
        const queueManager = new QueueManager(mockDisTube);
        const queue = new Queue(mockDisTube, createMockVoice());
        const song = {
          id: "1",
          duration: 180,
          stream: { playFromSource: true, url: "http://test.com/stream" },
        } as Song;
        queue.songs = [song];

        mockDisTube.handler.attachStreamInfo.mockRejectedValue(new Error("stream unavailable"));
        vi.spyOn(queue, "stop").mockResolvedValue(undefined);

        await queueManager.playSong(queue);

        expect(queue.songs).not.toContain(song);
        expect(mockDisTube.emitError).toHaveBeenCalled();
      });
    });

    describe("_beginTime reset", () => {
      beforeEach(() => {
        vi.clearAllMocks();
      });

      it("resets _beginTime to 0 after using it for seek", async () => {
        const mockDisTube = createMockDisTube({
          emitError: vi.fn(),
          queues: { remove: vi.fn() },
        });
        const queueManager = new QueueManager(mockDisTube);
        const mockVoice = createMockVoice();
        mockVoice.play.mockResolvedValue(undefined);
        const queue = new Queue(mockDisTube, mockVoice);
        const song = {
          id: "1",
          duration: 180,
          stream: { playFromSource: true, url: "http://test.com/stream" },
        } as Song;
        queue.songs = [song];
        queue._beginTime = 60; // Simulating a previous seek

        await queueManager.playSong(queue);

        expect(queue._beginTime).toBe(0);
        expect(DisTubeStream).toHaveBeenCalledWith(
          "http://test.com/stream",
          expect.objectContaining({
            seek: 60, // The seek value should use the original _beginTime
          }),
        );
      });

      it("preserves _beginTime value for seek option before resetting", async () => {
        const mockDisTube = createMockDisTube({
          emitError: vi.fn(),
          queues: { remove: vi.fn() },
        });
        const queueManager = new QueueManager(mockDisTube);
        const mockVoice = createMockVoice();
        mockVoice.play.mockResolvedValue(undefined);
        const queue = new Queue(mockDisTube, mockVoice);
        const song = {
          id: "1",
          duration: 300,
          stream: { playFromSource: true, url: "http://test.com/stream" },
        } as Song;
        queue.songs = [song];
        queue._beginTime = 120;

        await queueManager.playSong(queue);

        // Verify seek was called with the original _beginTime value
        expect(DisTubeStream).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            seek: 120,
          }),
        );
        // Then verify it was reset
        expect(queue._beginTime).toBe(0);
      });
    });
  });

  describe("voice channel change listener", () => {
    it("emits VOICE_CHANNEL_CHANGE when voice channelChange listener is triggered", async () => {
      const mockDisTube = createMockDisTube();
      const mockVoice = {
        ...createMockVoice(),
        id: "234567890123456789",
        join: vi.fn().mockResolvedValue(undefined),
      };
      mockDisTube.voices.create.mockReturnValue(mockVoice);
      const queueManager = new QueueManager(mockDisTube);

      const mockChannel = {
        id: "123456789012345678",
        guildId: "234567890123456789",
        guild: {},
        client: {},
      } as any;

      const queue = await queueManager.create(mockChannel);
      expect(queue._listeners?.channelChange).toBeDefined();

      const oldChannel = { id: "111111111111111111" } as any;
      const newChannel = { id: "222222222222222222" } as any;
      queue._listeners!.channelChange(oldChannel, newChannel);

      expect(mockDisTube.emit).toHaveBeenCalledWith(Events.VOICE_CHANNEL_CHANGE, queue, oldChannel, newChannel);
    });
  });

  describe("preload", () => {
    const createPreloadMocks = (optionOverrides = {}) => {
      const mockDisTube = createMockDisTube({
        options: {
          emitNewSongOnly: false,
          savePreviousSongs: true,
          preload: { enabled: true, threshold: 15 },
          ffmpeg: { path: "ffmpeg", args: { global: {}, input: {}, output: {} } },
          ...optionOverrides,
        },
      });
      const queueManager = new QueueManager(mockDisTube);
      const queue = new Queue(mockDisTube, createMockVoice());
      const current: Song = {
        id: "1",
        duration: 100,
        stream: { playFromSource: true, url: "https://example.com/1" },
      } as Song;
      const next: Song = { id: "2", stream: { playFromSource: true, url: "https://example.com/2" } } as Song;
      queue.songs = [current, next];
      return { mockDisTube, queueManager, queue, current, next };
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.clearAllMocks();
    });

    describe("schedulePreload", () => {
      it("does nothing when preload is disabled", () => {
        const { queueManager, queue } = createPreloadMocks({ preload: false });
        const spy = vi.spyOn(queueManager, "preloadNextSong");

        queueManager.schedulePreload(queue);

        expect(spy).not.toHaveBeenCalled();
        expect(queue._preloadTimeout).toBeUndefined();
      });

      it("does nothing when there is no next song", () => {
        const { queueManager, queue, next } = createPreloadMocks();
        queue.songs = [queue.songs[0]];
        const spy = vi.spyOn(queueManager, "preloadNextSong");

        queueManager.schedulePreload(queue);

        expect(queue.songs).not.toContain(next);
        expect(spy).not.toHaveBeenCalled();
        expect(queue._preloadTimeout).toBeUndefined();
      });

      it("does nothing when the next song is already preloaded", () => {
        const { queueManager, queue, next } = createPreloadMocks();
        queue._preloadedSong = next;
        queue._preloadedStream = { on: vi.fn() } as any;
        const spy = vi.spyOn(queueManager, "preloadNextSong");

        queueManager.schedulePreload(queue);

        expect(spy).not.toHaveBeenCalled();
        expect(queue._preloadTimeout).toBeUndefined();
      });

      it("preloads immediately when the remaining time is within the threshold", () => {
        const { queueManager, queue, current } = createPreloadMocks();
        current.duration = 10;
        const spy = vi.spyOn(queueManager, "preloadNextSong");

        queueManager.schedulePreload(queue);

        expect(spy).toHaveBeenCalledWith(queue);
        expect(queue._preloadTimeout).toBeUndefined();
      });

      it("preloads immediately when the current song has no duration (live stream)", () => {
        const { queueManager, queue, current } = createPreloadMocks();
        current.duration = 0;
        const spy = vi.spyOn(queueManager, "preloadNextSong");

        queueManager.schedulePreload(queue);

        expect(spy).toHaveBeenCalledWith(queue);
      });

      it("schedules preloading when enough time remains in the current song", async () => {
        const { queueManager, queue } = createPreloadMocks();
        (queue.voice as any).playbackTime = 10;
        const spy = vi.spyOn(queueManager, "preloadNextSong");

        queueManager.schedulePreload(queue);

        // remaining = 90, threshold = 15 => fires after 75s
        expect(queue._preloadTimeout).toBeDefined();
        vi.advanceTimersByTime(74_999);
        expect(spy).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(spy).toHaveBeenCalledWith(queue);
        expect(queue._preloadTimeout).toBeUndefined();
      });

      it("clears the previous timer when scheduled again", () => {
        const { queueManager, queue } = createPreloadMocks();
        (queue.voice as any).playbackTime = 10;
        const clearSpy = vi.spyOn(global, "clearTimeout");

        queueManager.schedulePreload(queue);
        const firstTimeout = queue._preloadTimeout;
        queueManager.schedulePreload(queue);

        expect(firstTimeout).toBeDefined();
        expect(clearSpy).toHaveBeenCalled();
        expect(queue._preloadTimeout).toBeDefined();
        expect(queue._preloadTimeout).not.toBe(firstTimeout);
      });
    });

    describe("preloadNextSong", () => {
      it("does nothing when preload is disabled", async () => {
        const { mockDisTube, queueManager, queue } = createPreloadMocks({ preload: false });

        await queueManager.preloadNextSong(queue);

        expect(mockDisTube.emit).not.toHaveBeenCalledWith(Events.PRELOAD_SONG, queue, expect.anything());
      });

      it("stores the preloaded stream and emits events on success", async () => {
        const { mockDisTube, queueManager, queue, next } = createPreloadMocks();

        await queueManager.preloadNextSong(queue);

        expect(mockDisTube.emit).toHaveBeenCalledWith(Events.PRELOAD_SONG, queue, next);
        expect(mockDisTube.emit).toHaveBeenCalledWith(Events.PRELOADED_SONG, queue, next);
        expect(queue._preloadedSong).toBe(next);
        expect(queue._preloadedStream).toBeDefined();
      });

      it("does not replay an already preloaded song", async () => {
        const { mockDisTube, queueManager, queue, next } = createPreloadMocks();
        queue._preloadedSong = next;
        queue._preloadedStream = { on: vi.fn(), kill: vi.fn() } as any;

        await queueManager.preloadNextSong(queue);

        expect(mockDisTube.handler.attachStreamInfo).not.toHaveBeenCalled();
        expect(mockDisTube.emit).not.toHaveBeenCalledWith(Events.PRELOAD_SONG, queue, next);
      });

      it("emits PRELOAD_ERROR when resolving the stream fails", async () => {
        const { mockDisTube, queueManager, queue, next } = createPreloadMocks();
        mockDisTube.handler.attachStreamInfo.mockRejectedValue(new Error("resolve failed"));

        await queueManager.preloadNextSong(queue);

        expect(mockDisTube.emit).toHaveBeenCalledWith(Events.PRELOAD_ERROR, queue, next, expect.any(Error));
        expect(queue._preloadedSong).toBeUndefined();
        expect(queue._preloadedStream).toBeUndefined();
      });

      it("discards the preload when the queue changed while resolving the stream", async () => {
        const { mockDisTube, queueManager, queue } = createPreloadMocks();
        mockDisTube.handler.attachStreamInfo.mockImplementation(async () => {
          queue.songs[1] = { id: "replaced" } as Song;
        });

        await queueManager.preloadNextSong(queue);

        expect(DisTubeStream).not.toHaveBeenCalled();
        expect(queue._preloadedSong).toBeUndefined();
      });

      it("kills the created stream when the queue changed after the stream was built", async () => {
        const { queueManager, queue } = createPreloadMocks();
        const kill = vi.fn();
        (DisTubeStream as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(function (this: any) {
          // Stop the queue at the moment the stream is created, simulating a
          // state change between the two on-line checks in preloadNextSong.
          queue.stopped = true;
          return { on: vi.fn(), kill };
        });

        await queueManager.preloadNextSong(queue);

        expect(DisTubeStream).toHaveBeenCalled();
        expect(kill).toHaveBeenCalled();
        expect(queue._preloadedStream).toBeUndefined();
      });
    });

    describe("playSong integration", () => {
      it("uses the preloaded stream instead of resolving and creating a new one", async () => {
        const { mockDisTube, queueManager, queue, current } = createPreloadMocks();
        queue.songs = [current]; // Avoid scheduling a new preload as a side effect
        const preloadedStream = { on: vi.fn(), kill: vi.fn() };
        queue._preloadedSong = current;
        queue._preloadedStream = preloadedStream as any;

        await queueManager.playSong(queue);

        expect(mockDisTube.handler.attachStreamInfo).not.toHaveBeenCalled();
        expect(DisTubeStream).not.toHaveBeenCalled();
        expect(queue.voice.play).toHaveBeenCalledWith(preloadedStream);
        expect(queue._preloadedSong).toBeUndefined();
        expect(queue._preloadedStream).toBeUndefined();
        expect(mockDisTube.emit).toHaveBeenCalledWith(Events.PLAY_SONG, queue, current);
      });
    });
  });
});
