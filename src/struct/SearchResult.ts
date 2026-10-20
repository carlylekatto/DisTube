import { SearchResultType } from "../type";
import type { Playlist } from "./Playlist";
import type { Song } from "./Song";

/**
 * The result of a search.
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
   * Create a search result.
   * @param query     - The query of the search
   * @param options   - Optional data
   */
  constructor(
    query: string,
    {
      songs = [],
      playlist,
      queryType,
    }: {
      songs?: Song<T>[];
      playlist?: Playlist<T>;
      queryType?: SearchResultType;
    } = {},
  ) {
    this.query = query;
    this.songs = songs;
    this.playlist = playlist;
    this.queryType = queryType ?? SearchResultType.TRACK;
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
      songs: this.songs.map(song => song.toString()),
      playlist: this.playlist?.toString(),
    };
  }
}
