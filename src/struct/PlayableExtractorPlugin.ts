import type { Awaitable, ResolveOptions } from "../type";
import { PluginType } from "../type";
import { ExtractorPlugin } from "./ExtractorPlugin";
import type { Playlist } from "./Playlist";
import type { Song } from "./Song";

/**
 * This plugin can extract and play song from supported links, but cannot search for songs from its source
 */
export abstract class PlayableExtractorPlugin extends ExtractorPlugin {
  override readonly type: PluginType = PluginType.PLAYABLE_EXTRACTOR;
  /**
   * Check if the url is working with this plugin
   * @param url - Input url
   */
  abstract override validate(url: string): Awaitable<boolean>;
  /**
   * Resolve the validated url to a {@link Song} or a {@link Playlist}.
   * @param url     - URL
   * @param options - Optional options
   */
  abstract override resolve<T>(url: string, options: ResolveOptions<T>): Awaitable<Song<T> | Playlist<T>>;
  /**
   * Get the stream url from {@link Song#url}. Returns {@link Song#url} by default.
   * Not needed if the plugin plays song from YouTube.
   * @param song - Input song
   */
  abstract override getStreamURL<T>(song: Song<T>): Awaitable<string>;
}
