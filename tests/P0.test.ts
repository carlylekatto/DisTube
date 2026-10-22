import { ChannelType, GatewayIntentBits, IntentsBitField } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisTube, Events } from "@";

const createMockClient = () =>
  ({
    options: {
      intents: new IntentsBitField([GatewayIntentBits.GuildVoiceStates]),
    },
    user: { id: "987654321098765432" },
    login: vi.fn(),
  }) as any;

const createMockVoiceChannel = () =>
  ({
    id: "123456789012345678",
    type: ChannelType.GuildVoice,
    guild: {
      id: "234567890123456789",
      members: {
        me: {
          id: "987654321098765432",
          user: { id: "987654321098765432" },
          guild: { id: "234567890123456789" },
        },
      },
      voiceAdapterCreator: vi.fn(),
    },
    joinable: true,
    full: false,
  }) as any;

const createMockTextChannel = () =>
  ({
    id: "345678901234567890",
    guildId: "234567890123456789",
    type: ChannelType.GuildText,
    nsfw: false,
    isThread: vi.fn().mockReturnValue(false),
    send: vi.fn(),
  }) as any;

const createMockMessage = () =>
  ({
    id: "456789012345678901",
    guildId: "234567890123456789",
    type: 0, // ChannelType.Default
    channel: createMockTextChannel(),
    member: {
      id: "567890123456789012",
      user: { id: "567890123456789012" },
      guild: { id: "234567890123456789" },
    },
    author: { id: "567890123456789012" },
  }) as any;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("P0-1: the error event never crashes the process", () => {
  it("does not throw when nobody listens to the error event", () => {
    const distube = new DisTube(createMockClient());
    const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => {});

    expect(() => distube.emitError(new Error("boom"), undefined as any)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toMatchObject({ code: "DIS_TUBE_UNHANDLED_ERROR" });
  });

  it("re-throws the error when unhandledError is 'throw'", () => {
    const distube = new DisTube(createMockClient(), { unhandledError: "throw" });

    expect(() => distube.emitError(new Error("boom"), undefined as any)).toThrow("boom");
  });

  it("does nothing when unhandledError is 'ignore'", () => {
    const distube = new DisTube(createMockClient(), { unhandledError: "ignore" });
    const warn = vi.spyOn(process, "emitWarning").mockImplementation(() => {});

    expect(() => distube.emitError(new Error("boom"), undefined as any)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it("still delivers the error to the listeners", () => {
    const distube = new DisTube(createMockClient());
    const listener = vi.fn();
    distube.on(Events.ERROR, listener);

    const error = new Error("boom");
    const queue = { id: "guild-id" } as any;
    distube.emitError(error, queue, undefined);

    expect(listener).toHaveBeenCalledWith(error, queue, undefined);
  });

  it("returns false instead of throwing when the error is unhandled", () => {
    const distube = new DisTube(createMockClient(), { unhandledError: "ignore" });

    expect(distube.emit(Events.ERROR, new Error("boom"), undefined as any, undefined)).toBe(false);
  });
});

describe("P0-2: the number of listeners is not limited", () => {
  it("does not limit the listeners", () => {
    const distube = new DisTube(createMockClient());

    expect(distube.getMaxListeners()).toBe(0);
  });

  it("allows several listeners for the same event", () => {
    const distube = new DisTube(createMockClient());
    const first = vi.fn();
    const second = vi.fn();

    distube.on(Events.PLAY_SONG, first);
    distube.on(Events.PLAY_SONG, second);
    distube.emit(Events.PLAY_SONG, undefined as any, undefined as any);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("P0-5: PlayOptions.message is used as the default text channel", () => {
  it("uses the channel of the message when no textChannel is given", async () => {
    const distube = new DisTube(createMockClient());
    const voiceChannel = createMockVoiceChannel();
    const message = createMockMessage();

    distube.queues.get = vi.fn().mockReturnValue(undefined);
    distube.queues.create = vi.fn().mockResolvedValue({
      id: "234567890123456789",
      songs: [],
      _taskQueue: { queuing: vi.fn().mockResolvedValue(undefined), resolve: vi.fn(), hasPlayTask: false },
      addToQueue: vi.fn(),
      play: vi.fn(),
      remove: vi.fn(),
    });
    distube.handler.resolve = vi.fn().mockResolvedValue({
      id: "song-id",
      ageRestricted: false,
      stream: {},
    });

    await distube.play(voiceChannel, "a song", { message });

    expect(distube.queues.create).toHaveBeenCalledWith(voiceChannel, message.channel);
  });

  it("prefers the explicit textChannel over the message channel", async () => {
    const distube = new DisTube(createMockClient());
    const voiceChannel = createMockVoiceChannel();
    const message = createMockMessage();
    const textChannel = createMockTextChannel();

    distube.queues.get = vi.fn().mockReturnValue(undefined);
    distube.queues.create = vi.fn().mockResolvedValue({
      id: "234567890123456789",
      songs: [],
      _taskQueue: { queuing: vi.fn().mockResolvedValue(undefined), resolve: vi.fn(), hasPlayTask: false },
      addToQueue: vi.fn(),
      play: vi.fn(),
      remove: vi.fn(),
    });
    distube.handler.resolve = vi.fn().mockResolvedValue({
      id: "song-id",
      ageRestricted: false,
      stream: {},
    });

    await distube.play(voiceChannel, "a song", { message, textChannel });

    expect(distube.queues.create).toHaveBeenCalledWith(voiceChannel, textChannel);
  });
});

describe("P0-7: the original error is kept as the cause of a failed search", () => {
  it("keeps the original error as the cause", async () => {
    const distube = new DisTube(createMockClient());

    // There is no extractor plugin, so the search fails with NO_EXTRACTOR_PLUGIN.
    await expect(distube.handler.resolve("a query")).rejects.toThrow("Cannot find any song with this query");

    const error = await distube.handler.resolve("a query").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).cause).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error).message).toContain("extractor plugin");
  });
});

describe("P0-11: destroy() releases every resource", () => {
  it("stops every queue and leaves every voice channel", async () => {
    const distube = new DisTube(createMockClient());
    const queue = { id: "guild-id", stop: vi.fn().mockResolvedValue(undefined) };
    const voice = { id: "guild-id", leave: vi.fn() };

    distube.queues.collection.set("guild-id", queue as any);
    distube.voices.collection.set("guild-id", voice as any);

    await distube.destroy();

    expect(queue.stop).toHaveBeenCalledTimes(1);
    expect(voice.leave).toHaveBeenCalledTimes(1);
  });

  it("removes every listener", async () => {
    const distube = new DisTube(createMockClient());
    const listener = vi.fn();
    distube.on(Events.PLAY_SONG, listener);

    await distube.destroy();

    expect(distube.listenerCount(Events.PLAY_SONG)).toBe(0);
  });

  it("does not throw when a queue fails to stop", async () => {
    const distube = new DisTube(createMockClient());
    const queue = {
      id: "guild-id",
      stop: vi.fn().mockRejectedValue(new Error("cannot stop")),
    };

    distube.queues.collection.set("guild-id", queue as any);

    await expect(distube.destroy()).resolves.toBeUndefined();
  });
});
