import { GatewayIntentBits, IntentsBitField } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
  DisTube,
  DisTubeError,
  ExtractorPlugin,
  InfoExtractorPlugin,
  type ResolveOptions,
  type SearchOptions,
  SearchResult,
  Song,
} from "@";

const createMockClient = () =>
  ({
    options: {
      intents: new IntentsBitField([GatewayIntentBits.GuildVoiceStates]),
    },
    user: { id: "123456789012345678" },
    login: vi.fn(),
  }) as any;

const getProxySong = (song: Song): Song | undefined =>
  song.stream.playFromSource === false ? song.stream.song : undefined;

const getProxyStreamUrl = (song: Song): string | undefined => {
  const proxy = getProxySong(song);
  return proxy?.stream.playFromSource ? proxy.stream.url : undefined;
};

class MockSearchPlugin extends ExtractorPlugin {
  override readonly source: string;
  results: Song[] = [];

  constructor(source: string, results: Song[] = []) {
    super();
    this.source = source;
    this.results = results;
  }

  override async validate(): Promise<boolean> {
    return false;
  }

  override async resolve<_T>(): Promise<any> {
    throw new DisTubeError("NO_RESULT", "resolve");
  }

  override async search<T>(_query: string, _options?: SearchOptions<T>): Promise<SearchResult<T>> {
    return new SearchResult<T>(_query, { songs: this.results as any });
  }

  override async searchSong<T>(): Promise<Song<T> | null> {
    return (this.results[0] as any) ?? null;
  }

  override async getStreamURL<T>(song: Song<T>): Promise<string> {
    return `https://${this.source}.stream/${song.id}`;
  }
}

class MockMetadataOnlyPlugin extends InfoExtractorPlugin {
  override readonly source = "metadata-source";

  override async validate(): Promise<boolean> {
    return true;
  }

  override async resolve<T>(_url: string, options: ResolveOptions<T>): Promise<Song<T>> {
    return new Song<T>(
      {
        plugin: this,
        source: this.source,
        playFromSource: false,
        id: "meta-track",
        name: "Test Song",
        duration: 180,
      },
      options,
    );
  }

  override async createSearchQuery<T>(song: Song<T>): Promise<string> {
    return song.name ?? "Test Song";
  }
}

describe("DisTubeHandler Smart Fallback", () => {
  it("picks the candidate closest in duration within 5s tolerance", async () => {
    const youtube = new MockSearchPlugin("youtube", [
      new Song({
        plugin: {} as any,
        source: "youtube",
        playFromSource: true,
        id: "far-long",
        duration: 1800,
        name: "Long Remix",
      }),
      new Song({
        plugin: {} as any,
        source: "youtube",
        playFromSource: true,
        id: "far-short",
        duration: 60,
        name: "Short Clip",
      }),
      new Song({
        plugin: {} as any,
        source: "youtube",
        playFromSource: true,
        id: "nearest",
        duration: 182,
        name: "Official Track",
      }),
      new Song({
        plugin: {} as any,
        source: "youtube",
        playFromSource: true,
        id: "near",
        duration: 184,
        name: "Other Track",
      }),
    ]);

    const distube = new DisTube(createMockClient(), {
      plugins: [new MockMetadataOnlyPlugin(), youtube],
    });

    const song = new Song({
      plugin: distube.plugins[0],
      source: "metadata-source",
      playFromSource: false,
      id: "meta-1",
      name: "Test Song",
      duration: 180,
    });

    await distube.handler.attachStreamInfo(song);

    const proxy = getProxySong(song);
    expect(proxy).toBeDefined();
    expect(proxy?.id).toBe("nearest");
    expect(getProxyStreamUrl(song)).toBe("https://youtube.stream/nearest");
  });

  it("passes over a plugin whose candidates are all out of range (>5s) to the next plugin", async () => {
    const youtube = new MockSearchPlugin("youtube", [
      new Song({
        plugin: {} as any,
        source: "youtube",
        playFromSource: true,
        id: "yt-long",
        duration: 1800,
        name: "1 Hour Loop",
      }),
    ]);

    const soundcloud = new MockSearchPlugin("soundcloud", [
      new Song({
        plugin: {} as any,
        source: "soundcloud",
        playFromSource: true,
        id: "sc-match",
        duration: 178,
        name: "Original Track",
      }),
    ]);

    const distube = new DisTube(createMockClient(), {
      plugins: [new MockMetadataOnlyPlugin(), youtube, soundcloud],
    });

    const song = new Song({
      plugin: distube.plugins[0],
      source: "metadata-source",
      playFromSource: false,
      id: "meta-2",
      name: "Test Song",
      duration: 180,
    });

    await distube.handler.attachStreamInfo(song);

    const proxy = getProxySong(song);
    expect(proxy?.id).toBe("sc-match");
    expect(getProxyStreamUrl(song)).toBe("https://soundcloud.stream/sc-match");
  });

  it("prefers an in-range candidate before one of unknown duration", async () => {
    const youtube = new MockSearchPlugin("youtube", [
      new Song({
        plugin: {} as any,
        source: "youtube",
        playFromSource: true,
        id: "unknown-dur",
        duration: undefined,
        name: "Unknown",
      }),
      new Song({
        plugin: {} as any,
        source: "youtube",
        playFromSource: true,
        id: "exact",
        duration: 180,
        name: "Exact",
      }),
    ]);

    const distube = new DisTube(createMockClient(), {
      plugins: [new MockMetadataOnlyPlugin(), youtube],
    });

    const song = new Song({
      plugin: distube.plugins[0],
      source: "metadata-source",
      playFromSource: false,
      id: "meta-3",
      name: "Test Song",
      duration: 180,
    });

    await distube.handler.attachStreamInfo(song);

    expect(getProxySong(song)?.id).toBe("exact");
  });

  it("accepts candidate with unknown duration when none is in range", async () => {
    const youtube = new MockSearchPlugin("youtube", [
      new Song({
        plugin: {} as any,
        source: "youtube",
        playFromSource: true,
        id: "way-too-long",
        duration: 3600,
        name: "Long",
      }),
      new Song({
        plugin: {} as any,
        source: "youtube",
        playFromSource: true,
        id: "unknown-dur",
        duration: undefined,
        name: "Unknown",
      }),
    ]);

    const distube = new DisTube(createMockClient(), {
      plugins: [new MockMetadataOnlyPlugin(), youtube],
    });

    const song = new Song({
      plugin: distube.plugins[0],
      source: "metadata-source",
      playFromSource: false,
      id: "meta-4",
      name: "Test Song",
      duration: 180,
    });

    await distube.handler.attachStreamInfo(song);

    expect(getProxySong(song)?.id).toBe("unknown-dur");
  });

  it("picks the first candidate when target song has 0 duration (live stream)", async () => {
    const youtube = new MockSearchPlugin("youtube", [
      new Song({
        plugin: {} as any,
        source: "youtube",
        playFromSource: true,
        id: "yt-first",
        duration: 1800,
        name: "Live Stream",
      }),
      new Song({
        plugin: {} as any,
        source: "youtube",
        playFromSource: true,
        id: "yt-second",
        duration: 120,
        name: "Other",
      }),
    ]);

    const distube = new DisTube(createMockClient(), {
      plugins: [new MockMetadataOnlyPlugin(), youtube],
    });

    const song = new Song({
      plugin: distube.plugins[0],
      source: "metadata-source",
      playFromSource: false,
      id: "meta-live",
      name: "Test Live",
      duration: 0,
    });

    await distube.handler.attachStreamInfo(song);

    expect(getProxySong(song)?.id).toBe("yt-first");
  });

  it("filters out age-restricted candidates when nsfw option is false", async () => {
    const youtube = new MockSearchPlugin("youtube", [
      new Song({
        plugin: {} as any,
        source: "youtube",
        playFromSource: true,
        id: "yt-restricted",
        duration: 180,
        ageRestricted: true,
      }),
      new Song({
        plugin: {} as any,
        source: "youtube",
        playFromSource: true,
        id: "yt-clean",
        duration: 184,
        ageRestricted: false,
      }),
    ]);

    const distube = new DisTube(createMockClient(), {
      nsfw: false,
      plugins: [new MockMetadataOnlyPlugin(), youtube],
    });

    const song = new Song({
      plugin: distube.plugins[0],
      source: "metadata-source",
      playFromSource: false,
      id: "meta-nsfw",
      name: "Restricted test",
      duration: 180,
    });

    await distube.handler.attachStreamInfo(song);

    expect(getProxySong(song)?.id).toBe("yt-clean");
  });
});
