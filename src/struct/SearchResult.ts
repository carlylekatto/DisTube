import { SearchResultType } from "../type";
import type { Playlist } from "./Playlist";
import type { Song } from "./Song";

/**
 * The result of a search.
 *
 * It is the result type of every search, at the plugin level and at the
 * DisTube level.
 */
export class SearchResult<T = unknown> {
  /**
   * The query of the search.
   */
  readonly query: string;
  /**
   * The kind of result that was looked for.
   */
  readonly queryType: SearchResultType;
  /**
   * The songs that were found.
   */
  readonly songs: Song<T>[];
  /**
   * The playlist that was found, when the search returned one.
   */
  readonly playlist?: Playlist<T>;
  /**
   * The identifiers of the plugins that contributed to the result.
   */
  readonly sources: string[];
  /**
   * Create a search result.
   * @param query   - The query of the search
   * @param options - Optional data
   */
  constructor(
    query: string,
    {
      songs = [],
      playlist,
      queryType,
      sources = [],
    }: {
      songs?: Song<T>[];
      playlist?: Playlist<T>;
      queryType?: SearchResultType;
      sources?: string[];
    } = {},
  ) {
    this.query = query;
    this.songs = songs;
    this.playlist = playlist;
    this.queryType = queryType ?? SearchResultType.TRACK;
    this.sources = sources;
  }
  /**
   * Whether the search returned nothing.
   */
  isEmpty(): boolean {
    return this.songs.length === 0 && !this.playlist;
  }
  /**
   * Whether the search returned songs.
   */
  hasSongs(): boolean {
    return this.songs.length > 0;
  }
  /**
   * Whether the search returned a playlist.
   */
  hasPlaylist(): boolean {
    return Boolean(this.playlist);
  }
  /**
   * A plain object representation of the result.
   */
  toJSON(): object {
    return {
      query: this.query,
      queryType: this.queryType,
      sources: [...this.sources],
      songs: this.songs.map(song => ({
        id: song.id,
        name: song.name,
        url: song.url,
        duration: song.duration,
        formattedDuration: song.formattedDuration,
        thumbnail: song.thumbnail,
        source: song.source,
        uploader: song.uploader,
      })),
      playlist: this.playlist
        ? {
            id: this.playlist.id,
            name: this.playlist.name,
            url: this.playlist.url,
            thumbnail: this.playlist.thumbnail,
            songs: this.playlist.songs.length,
          }
        : undefined,
    };
  }
}
