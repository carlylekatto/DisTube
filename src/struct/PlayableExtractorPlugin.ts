import type { Awaitable, ResolveOptions } from "../type";
import { PluginType } from "../type";
import { ExtractorPlugin } from "./ExtractorPlugin";
import type { Playlist } from "./Playlist";
import type { Song } from "./Song";

/**
 * This plugin can extract and play song from supported links, but cannot search for songs from its source
 */
export abstract class PlayableExtractorPlugin extends ExtractorPlugin {
  /**
   * The type of the plugin.
   */
  override readonly type: PluginType = PluginType.PLAYABLE_EXTRACTOR;
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
   * Get the stream url from {@link Song#url}. Returns {@link Song#url} by default.
   * Not needed if the plugin plays the song itself.
   * @param song - Input song
   * @returns The url of the audio stream
   */
  abstract override getStreamURL<T>(song: Song<T>): Awaitable<string>;
}
