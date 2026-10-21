import type { Awaitable, ResolveOptions } from "../type";
import { PluginType } from "../type";
import { ExtractorPlugin } from "./ExtractorPlugin";
import type { Playlist } from "./Playlist";
import { PluginError, PluginErrorCode } from "./PluginError";
import type { Song } from "./Song";

/**
 * This plugin only can extract the info from supported links, but not play song directly from its source
 *
 * @deprecated Use {@link ExtractorPlugin} with `playable: false` instead.
 */
export abstract class InfoExtractorPlugin extends ExtractorPlugin {
  /**
   * The type of the plugin.
   */
  override readonly type: PluginType = PluginType.INFO_EXTRACTOR;
  /**
   * The songs of this plugin are resolved to a playable version by another
   * plugin.
   */
  override readonly playable = false;
  /**
   * Check if the url is working with this plugin
   * @param url - Input url
   * @returns `true` when the plugin can handle the url
   */
  abstract override validate(url: string): Awaitable<boolean>;
  /**
   * Resolve the validated url to a {@link Song} or a {@link Playlist}.
   * @param url     - URL
   * @param options - Optional options
   * @returns The resolved song or playlist
   */
  abstract override resolve<T>(url: string, options: ResolveOptions<T>): Awaitable<Song<T> | Playlist<T>>;

  /**
   * Create a search query to be used in {@link ExtractorPlugin#searchSong}
   * @param song - Input song
   * @returns The search query
   */
  abstract override createSearchQuery<T>(song: Song<T>): Awaitable<string>;

  /**
   * This plugin cannot play the songs it resolves, so it never has a stream url.
   * @param _song - Input song
   * @returns Nothing: it always throws
   * @throws {@link PluginError} Always, with the code `NO_STREAM`
   */
  override async getStreamURL<T>(_song: Song<T>): Promise<string> {
    throw new PluginError(PluginErrorCode.NO_STREAM);
  }
}
