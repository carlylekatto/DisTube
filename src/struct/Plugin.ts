import type { StreamServer } from "../core/StreamServer";
import type { DisTube } from "../DisTube";
import type { Awaitable, PluginType, ResolveOptions, SearchOptions } from "../type";
import { SearchResult } from "./SearchResult";
import type { Song } from "./Song";

/**
 * DisTube Plugin
 */
export abstract class Plugin {
  /**
   * Type of the plugin
   */
  abstract readonly type: PluginType;
  /**
   * The identifier of the source of the plugin.
   *
   * It defaults to the name of the class, lowercased, without the `Plugin`
   * suffix (`YoutubePlugin` -> `youtube`).
   *
   * It is used to route a search to a plugin, and to find a plugin with
   * {@link DisTube#getPlugin}.
   */
  readonly source?: string;
  /**
   * Additional identifiers of the source of the plugin, e.g. `["yt"]`.
   */
  readonly aliases?: string[];
  /**
   * Whether the songs of this plugin can be played directly.
   *
   * When it is `false`, the songs of the plugin are resolved to a playable
   * version by another plugin. It defaults to `true`.
   */
  readonly playable?: boolean;
  /**
   * DisTube
   */
  distube!: DisTube;
  init(distube: DisTube) {
    this.distube = distube;
  }
  /**
   * Every identifier of this plugin: its {@link Plugin.source} and its
   * {@link Plugin.aliases}, lowercased.
   *
   * The static properties of the class are used when the instance ones are not
   * defined, so a plugin can declare them either way.
   */
  get identifiers(): string[] {
    const names = new Set<string>();
    const ctor = this.constructor as { source?: string; aliases?: string[] };
    const source = this.source ?? ctor.source ?? this.constructor.name.replace(/Plugin$/iu, "");
    if (source) names.add(source.toLowerCase());
    for (const alias of this.aliases ?? ctor.aliases ?? []) {
      if (typeof alias === "string" && alias) names.add(alias.toLowerCase());
    }
    return [...names];
  }
  /**
   * The local HTTP server of the DisTube instance.
   *
   * Register a handler on it when the plugin cannot hand out a static URL to
   * FFmpeg, instead of running its own server.
   */
  get streams(): StreamServer {
    return this.distube.streams;
  }
  /**
   * Search for a song of the source.
   *
   * Override it to enable the search of your source. It returns `null` by
   * default, because a source that cannot be searched does not have any result.
   * @param query   - Search query
   * @param options - Optional options
   * @returns The song that was found, or `null`
   */
  searchSong<T>(_query: string, _options: ResolveOptions<T>): Awaitable<Song<T> | null> {
    return null;
  }
  /**
   * Search for the songs of the source.
   *
   * The default implementation returns the single result of
   * {@link Plugin#searchSong}. Override it to return more results, or to return
   * a playlist.
   * @param query   - Search query
   * @param options - Optional options
   * @returns The result of the search
   */
  async search<T>(query: string, options: SearchOptions<T> = {}): Promise<SearchResult<T>> {
    const song = await this.searchSong(query, options);
    return new SearchResult<T>(query, {
      songs: song ? [song] : [],
      queryType: options.type,
    });
  }
  /**
   * Create the query used to find a playable version of a song.
   *
   * It is used when the plugin cannot play the songs it resolves.
   * @param song - Input song
   * @returns The search query
   */
  createSearchQuery<T>(song: Song<T>): Awaitable<string> {
    return `${song.name ?? ""} ${song.uploader?.name ?? ""}`.trim();
  }
  /**
   * Get related songs from a supported url.
   *
   * Override it to enable the autoplay for your source. Return an empty array
   * when your source does not have any related songs.
   * @param song - Input song
   */
  getRelatedSongs(_song: Song): Awaitable<Song[]> {
    return [];
  }
  /**
   * Destroy the plugin.
   *
   * It is called when the {@link DisTube} instance is destroyed. Override it to
   * release every resource held by the plugin (HTTP servers, timers, browser
   * sessions, ...).
   */
  destroy(): void | Promise<void> {
    // Nothing to destroy by default
  }
}
