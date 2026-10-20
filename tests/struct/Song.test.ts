import { GatewayIntentBits, IntentsBitField } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { DisTube, DisTubeError, Playlist, Song, type SongInfo } from "@";

const createSongInfo = (overrides: Partial<SongInfo> = {}): SongInfo => ({
  plugin: null,
  source: "test",
  playFromSource: true,
  id: "song-id",
  ...overrides,
});

describe("Song metadata", () => {
  it("uses the metadata given in the options", () => {
    const song = new Song(createSongInfo(), { metadata: { fromOptions: true } });

    expect(song.metadata).toEqual({ fromOptions: true });
  });

  it("falls back to the metadata of the song info", () => {
    const song = new Song(createSongInfo({ metadata: { fromInfo: true } }));

    expect(song.metadata).toEqual({ fromInfo: true });
  });

  it("prefers the metadata of the options over the one of the song info", () => {
    const song = new Song(createSongInfo({ metadata: { fromInfo: true } }), { metadata: { fromOptions: true } });

    expect(song.metadata).toEqual({ fromOptions: true });
  });
});

describe("Playlist metadata", () => {
  it("does not wipe the metadata of the songs when there is none", () => {
    const song = new Song(createSongInfo({ metadata: { spotifyUri: "spotify:track:1" } }));
    const playlist = new Playlist({ source: "test", songs: [song] });

    expect(song.metadata).toEqual({ spotifyUri: "spotify:track:1" });
    expect(playlist.metadata).toBeUndefined();
  });

  it("propagates the metadata to the songs when there is one", () => {
    const song = new Song(createSongInfo({ metadata: { spotifyUri: "spotify:track:1" } }));
    new Playlist({ source: "test", songs: [song] }, { metadata: { requestedBy: "user" } });

    expect(song.metadata).toEqual({ requestedBy: "user" });
  });
});

describe("DisTubeError.withMessage()", () => {
  it("uses the custom message instead of the template", () => {
    const error = DisTubeError.withMessage("CANNOT_RESOLVE_SONG", "Không tìm thấy bài hát trên SoundCloud");

    expect(error.message).toBe("Không tìm thấy bài hát trên SoundCloud");
    expect(error.errorCode).toBe("CANNOT_RESOLVE_SONG");
    expect(error.name).toBe("DisTubeError [CANNOT_RESOLVE_SONG]");
  });

  it("keeps the cause", () => {
    const cause = new Error("network down");
    const error = DisTubeError.withMessage("NO_RESULT", "Không tìm thấy kết quả", { cause });

    expect(error.cause).toBe(cause);
  });

  it("does not throw when the error code needs more arguments", () => {
    expect(() => DisTubeError.withMessage("MISSING_KEYS", "custom message")).not.toThrow();
  });

  it("keeps the default template when no custom message is given", () => {
    const error = new DisTubeError("CANNOT_RESOLVE_SONG", "some query");

    expect(error.message).toBe("Cannot resolve 'some query' to a Song");
  });
});

describe("DisTube#destroy()", () => {
  it("destroys every plugin", async () => {
    const destroy = vi.fn();
    const plugin = { init: vi.fn(), destroy };
    const distube = new DisTube(
      {
        options: { intents: new IntentsBitField([GatewayIntentBits.GuildVoiceStates]) },
        user: { id: "1" },
        login: vi.fn(),
      } as any,
      { plugins: [plugin as any] },
    );

    await distube.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
