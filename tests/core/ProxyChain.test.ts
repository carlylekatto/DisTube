import { GatewayIntentBits, IntentsBitField } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { DisTube, ExtractorPlugin, InfoExtractorPlugin, type Playlist, PluginType, type ResolveOptions, Song } from "@";

const getProxySong = (song: Song): Song | undefined => (song.stream as { song?: Song }).song;

const getProxyStreamUrl = (song: Song): string | undefined =>
  (getProxySong(song)?.stream as { url?: string } | undefined)?.url;

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
  override async validate(): Promise<boolean> {
    return true;
  }
  override async resolve<T>(_url: string, options: ResolveOptions<T>): Promise<Song<T> | Playlist<T>> {
    return new Song<T>({ plugin: this, source: "youtube", playFromSource: true, id: "yt", name: "A song" }, options);
  }
  override async searchSong<T>(query: string): Promise<Song<T> | null> {
    return new Song<T>({ plugin: this, source: "youtube", playFromSource: true, id: `yt:${query}`, name: query }, {});
  }
  override async getStreamURL<T>(_song: Song<T>): Promise<string> {
    return "http://youtube.com/stream";
  }
}

class SpotifyPlugin extends InfoExtractorPlugin {
  override readonly source = "spotify";
  override async validate(): Promise<boolean> {
    return true;
  }
  override async resolve<T>(_url: string, _options: ResolveOptions<T>): Promise<Song<T>> {
    return new Song<T>(
      {
        plugin: this,
        source: "spotify",
        playFromSource: true,
        id: "sp1",
        name: "Never Gonna Give You Up",
        uploader: { name: "Rick Astley" },
      },
      _options,
    );
  }
  override async createSearchQuery<T>(_song: Song<T>): Promise<string> {
    return "never gonna give you up";
  }
}

/**
 * A plugin that only knows the metadata of a song: the audio is played by
 * another plugin.
 */
class InfoPlugin extends InfoExtractorPlugin {
  override readonly source = "example";
  override async validate(): Promise<boolean> {
    return true;
  }
  override async resolve<T>(_url: string, options: ResolveOptions<T>): Promise<Song<T>> {
    return new Song<T>(
      {
        plugin: this,
        source: "example",
        playFromSource: true,
        id: "ex1",
        name: "Never Gonna Give You Up",
        uploader: { name: "Rick Astley" },
      },
      options,
    );
  }
  override async createSearchQuery<T>(_song: Song<T>): Promise<string> {
    return "never gonna give you up";
  }
}

describe("A plugin that cannot play its own songs", () => {
  it("is not playable", () => {
    expect(new SpotifyPlugin().playable).toBe(false);
  });

  it("has its own type", () => {
    expect(new SpotifyPlugin().type).toBe(PluginType.INFO_EXTRACTOR);
  });

  it("resolves its songs to a playable version", async () => {
    const plugin = new SpotifyPlugin();
    const song = await plugin.resolve("https://open.spotify.com/track/1", {});

    expect(song).toBeInstanceOf(Song);
    expect((song as Song).stream.playFromSource).toBe(false);
  });

  it("cannot give a stream url", async () => {
    const plugin = new SpotifyPlugin();

    await expect(plugin.getStreamURL({ id: "sp" } as any)).rejects.toThrow("No playable stream");
  });
});

describe("The fallback chain of the proxy", () => {
  it("finds a playable version with another plugin", async () => {
    const youtube = new YoutubePlugin();
    const spotify = new SpotifyPlugin();
    const distube = new DisTube(createMockClient(), { plugins: [spotify, youtube] });

    const song = (await spotify.resolve("https://open.spotify.com/track/1", {})) as Song;
    expect(song.stream.playFromSource).toBe(false);

    await distube.handler.attachStreamInfo(song);

    expect(getProxySong(song)).toBeDefined();
    expect(getProxySong(song)?.id).toBe("yt:never gonna give you up");
    expect(getProxyStreamUrl(song)).toBe("http://youtube.com/stream");
  });

  it("tries every searchable plugin until one of them has a result", async () => {
    const first = new YoutubePlugin();
    first.searchSong = vi.fn().mockResolvedValue(null);
    const second = new YoutubePlugin();
    second.searchSong = vi
      .fn()
      .mockResolvedValue(
        new Song({ plugin: second, source: "youtube", playFromSource: true, id: "found", name: "found" }, {}),
      );

    const spotify = new SpotifyPlugin();
    const distube = new DisTube(createMockClient(), { plugins: [spotify, first, second] });

    const song = (await spotify.resolve("https://open.spotify.com/track/1", {})) as Song;
    await distube.handler.attachStreamInfo(song);

    expect(first.searchSong).toHaveBeenCalled();
    expect(second.searchSong).toHaveBeenCalled();
    expect(getProxySong(song)?.id).toBe("found");
  });

  it("throws NO_RESULT when no plugin has a playable version", async () => {
    const youtube = new YoutubePlugin();
    youtube.searchSong = vi.fn().mockResolvedValue(null);
    const spotify = new SpotifyPlugin();
    const distube = new DisTube(createMockClient(), { plugins: [spotify, youtube] });

    const song = (await spotify.resolve("https://open.spotify.com/track/1", {})) as Song;

    await expect(distube.handler.attachStreamInfo(song)).rejects.toThrow("Cannot find any song");
  });

  it("does not ask the plugin that resolved the song", async () => {
    const youtube = new YoutubePlugin();
    const spotify = new SpotifyPlugin();
    const searchSong = vi.spyOn(spotify, "searchSong");
    const distube = new DisTube(createMockClient(), { plugins: [spotify, youtube] });

    const song = (await spotify.resolve("https://open.spotify.com/track/1", {})) as Song;
    await distube.handler.attachStreamInfo(song);

    expect(searchSong).not.toHaveBeenCalled();
  });

  it("skips a plugin that cannot play its own songs", async () => {
    const info = new InfoPlugin();
    const youtube = new YoutubePlugin();
    const searchSong = vi.spyOn(info, "searchSong");
    const distube = new DisTube(createMockClient(), { plugins: [info, youtube] });

    const song = (await info.resolve("https://example.com/track/1", {})) as Song;
    await distube.handler.attachStreamInfo(song);

    expect(searchSong).not.toHaveBeenCalled();
    expect(getProxySong(song)?.id).toBe("yt:never gonna give you up");
  });

  it("skips a result that cannot be played", async () => {
    const info = new InfoPlugin();
    const unplayable = new YoutubePlugin();
    unplayable.searchSong = vi.fn().mockResolvedValue({
      id: "not-playable",
      name: "not playable",
      source: "youtube",
      playFromSource: false,
      stream: { playFromSource: false },
    } as any);
    const playable = new YoutubePlugin();
    const distube = new DisTube(createMockClient(), { plugins: [info, unplayable, playable] });

    const song = (await info.resolve("https://example.com/track/1", {})) as Song;
    await distube.handler.attachStreamInfo(song);

    expect(getProxySong(song)?.id).toBe("yt:never gonna give you up");
  });

  it("keeps the metadata of the original song", async () => {
    const info = new InfoPlugin();
    const youtube = new YoutubePlugin();
    const distube = new DisTube(createMockClient(), { plugins: [info, youtube] });

    const song = (await info.resolve("https://example.com/track/1", { metadata: { requester: "user" } })) as Song;
    await distube.handler.attachStreamInfo(song);

    expect(song.metadata).toEqual({ requester: "user" });
  });
});
