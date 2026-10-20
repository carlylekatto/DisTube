import { describe, expect, it, vi } from "vitest";
import {
  ExtractorPlugin,
  PlayableExtractorPlugin,
  type Playlist,
  Plugin,
  PluginType,
  type ResolveOptions,
  type Song,
} from "@";

describe("Plugin", () => {
  describe("getRelatedSongs", () => {
    it("has a default implementation returning an empty array", async () => {
      class MinimalPlugin extends Plugin {
        readonly type = PluginType.EXTRACTOR;
      }

      const plugin = new MinimalPlugin();
      const song = { id: "song-id" } as Song;

      expect(await plugin.getRelatedSongs(song)).toEqual([]);
    });

    it("can be overridden by an extractor plugin", async () => {
      const related = { id: "related" } as Song;

      class MyExtractor extends ExtractorPlugin {
        override async validate(): Promise<boolean> {
          return true;
        }
        override async resolve<T>(_url: string, _options: ResolveOptions<T>): Promise<Song<T> | Playlist<T>> {
          return { id: "song-id" } as Song<T>;
        }
        override async searchSong<T>(_query: string, _options: ResolveOptions<T>): Promise<Song<T> | null> {
          return null;
        }
        override async getStreamURL<T>(song: Song<T>): Promise<string> {
          return song.url ?? "";
        }
        override async getRelatedSongs(_song: Song): Promise<Song[]> {
          return [related];
        }
      }

      const plugin = new MyExtractor();

      expect(await plugin.getRelatedSongs({ id: "song-id" } as Song)).toEqual([related]);
    });

    it("can be omitted by a playable extractor plugin", async () => {
      class MyPlayableExtractor extends PlayableExtractorPlugin {
        override async validate(): Promise<boolean> {
          return true;
        }
        override async resolve<T>(_url: string, _options: ResolveOptions<T>): Promise<Song<T> | Playlist<T>> {
          return { id: "song-id" } as Song<T>;
        }
        override async getStreamURL<T>(song: Song<T>): Promise<string> {
          return song.url ?? "";
        }
      }

      const plugin = new MyPlayableExtractor();

      expect(await plugin.getRelatedSongs({ id: "song-id" } as Song)).toEqual([]);
    });

    it("is called with the song by the queue", async () => {
      const getRelatedSongs = vi.fn().mockResolvedValue([]);
      const plugin = new (class extends Plugin {
        readonly type = PluginType.EXTRACTOR;
        override getRelatedSongs(song: Song) {
          return getRelatedSongs(song);
        }
      })();

      const song = { id: "song-id" } as Song;
      await plugin.getRelatedSongs(song);

      expect(getRelatedSongs).toHaveBeenCalledWith(song);
    });
  });
});
