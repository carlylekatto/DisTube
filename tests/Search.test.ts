import { GatewayIntentBits, IntentsBitField } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import {
  DisTube,
  ExtractorPlugin,
  type Playlist,
  PluginType,
  type ResolveOptions,
  SearchResult,
  SearchResultType,
  type Song,
} from "@";

const createMockClient = () =>
  ({
    options: {
      intents: new IntentsBitField([GatewayIntentBits.GuildVoiceStates]),
    },
    user: { id: "987654321098765432" },
    login: vi.fn(),
  }) as any;

class YoutubePlugin extends ExtractorPlugin {
  override readonly source = "youtube";
  override readonly aliases = ["yt"];
  songs: Song[] = [];
  async validate(): Promise<boolean> {
    return true;
  }
  async resolve<T>(_url: string, _options: ResolveOptions<T>): Promise<Song<T> | Playlist<T>> {
    return { id: "yt", stream: {} } as Song<T>;
  }
  async searchSong<T>(query: string): Promise<Song<T> | null> {
    return { id: `yt:${query}`, name: query, stream: {} } as Song<T>;
  }
  override async search<T>(query: string, options: { limit?: number } = {}): Promise<Song<T>[]> {
    const limit = options.limit ?? 10;
    return Array.from({ length: limit }, (_, i) => ({ id: `yt:${query}:${i}`, name: query, stream: {} }) as Song<T>);
  }
  async getStreamURL(): Promise<string> {
    return "http://example.com/stream";
  }
}

class SoundcloudPlugin extends ExtractorPlugin {
  async validate(): Promise<boolean> {
    return true;
  }
  async resolve<T>(_url: string, _options: ResolveOptions<T>): Promise<Song<T> | Playlist<T>> {
    return { id: "sc", stream: {} } as Song<T>;
  }
  async searchSong<T>(query: string): Promise<Song<T> | null> {
    return { id: `sc:${query}`, name: query, stream: {} } as Song<T>;
  }
  async getStreamURL(): Promise<string> {
    return "http://example.com/stream";
  }
}

describe("Plugin identifiers", () => {
  it("uses the source and the aliases of the plugin", () => {
    const plugin = new YoutubePlugin();

    expect(plugin.identifiers).toEqual(["youtube", "yt"]);
  });

  it("falls back to the name of the class", () => {
    const plugin = new SoundcloudPlugin();

    expect(plugin.identifiers).toEqual(["soundcloud"]);
  });
});

describe("DisTube#getPlugin()", () => {
  it("finds a plugin by its source", () => {
    const youtube = new YoutubePlugin();
    const distube = new DisTube(createMockClient(), { plugins: [youtube] });

    expect(distube.getPlugin("youtube")).toBe(youtube);
  });

  it("finds a plugin by one of its aliases", () => {
    const youtube = new YoutubePlugin();
    const distube = new DisTube(createMockClient(), { plugins: [youtube] });

    expect(distube.getPlugin("yt")).toBe(youtube);
  });

  it("is case insensitive", () => {
    const youtube = new YoutubePlugin();
    const distube = new DisTube(createMockClient(), { plugins: [youtube] });

    expect(distube.getPlugin("YouTube")).toBe(youtube);
  });

  it("returns undefined when there is no such plugin", () => {
    const distube = new DisTube(createMockClient(), { plugins: [] });

    expect(distube.getPlugin("youtube")).toBeUndefined();
  });
});

describe("DisTube#search()", () => {
  it("searches in every plugin and merges the results", async () => {
    const youtube = new YoutubePlugin();
    const soundcloud = new SoundcloudPlugin();
    const distube = new DisTube(createMockClient(), { plugins: [youtube, soundcloud] });

    const result = await distube.search("song", { limit: 3 });

    expect(result).toBeInstanceOf(SearchResult);
    expect(result.query).toBe("song");
    expect(result.songs).toHaveLength(3);
    expect(result.hasSongs()).toBe(true);
    expect(result.isEmpty()).toBe(false);
  });

  it("only searches in the given source", async () => {
    const youtube = new YoutubePlugin();
    const soundcloud = new SoundcloudPlugin();
    const distube = new DisTube(createMockClient(), { plugins: [youtube, soundcloud] });

    const result = await distube.search("song", { source: "soundcloud" });

    expect(result.songs).toHaveLength(1);
    expect(result.songs[0]?.id).toBe("sc:song");
  });

  it("returns an empty result when the source is unknown", async () => {
    const distube = new DisTube(createMockClient(), { plugins: [new YoutubePlugin()] });

    const result = await distube.search("song", { source: "unknown" });

    expect(result.isEmpty()).toBe(true);
    expect(result.songs).toHaveLength(0);
  });

  it("respects the limit", async () => {
    const distube = new DisTube(createMockClient(), { plugins: [new YoutubePlugin()] });

    const result = await distube.search("song", { limit: 2 });

    expect(result.songs).toHaveLength(2);
  });

  it("uses the default limit of 10", async () => {
    const distube = new DisTube(createMockClient(), { plugins: [new YoutubePlugin()] });

    const result = await distube.search("song");

    expect(result.songs).toHaveLength(10);
  });

  it("carries the query type", async () => {
    const distube = new DisTube(createMockClient(), { plugins: [new YoutubePlugin()] });

    const result = await distube.search("song", { type: SearchResultType.VIDEO });

    expect(result.queryType).toBe(SearchResultType.VIDEO);
  });
});

describe("ExtractorPlugin#search()", () => {
  it("returns the single result of searchSong by default", async () => {
    const plugin = new SoundcloudPlugin();

    const songs = await plugin.search("song");

    expect(songs).toHaveLength(1);
    expect(songs[0]?.id).toBe("sc:song");
  });
});

describe("Plugin type", () => {
  it("is inherited by the extractor plugins", () => {
    expect(new YoutubePlugin().type).toBe(PluginType.EXTRACTOR);
  });
});
