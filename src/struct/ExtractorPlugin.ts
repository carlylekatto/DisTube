import type { Awaitable, ResolveOptions } from "../type";
import { PluginType } from "../type";
import type { Playlist } from "./Playlist";
import { Plugin } from "./Plugin";
import type { Song } from "./Song";

/**
 * This plugin can extract the info, search, and play a song directly from its source
 */
export abstract class ExtractorPlugin extends Plugin {
  /**
   * The type of the plugin.
   */
  override readonly type: PluginType = PluginType.EXTRACTOR;
  /**
   * Check if the url is working with this plugin
   * @param url - Input url
   * @returns `true` when the plugin can handle the url
   */
  abstract validate(url: string): Awaitable<boolean>;
  /**
   * Resolve the validated url to a {@link Song} or a {@link Playlist}.
   * @param url     - URL
   * @param options - Optional options
   * @returns The resolved song or playlist
   */
  abstract resolve<T>(url: string, options: ResolveOptions<T>): Awaitable<Song<T> | Playlist<T>>;
  /**
   * Get the stream url from {@link Song#url}. Returns {@link Song#url} by default.
   * Not needed if the plugin plays the song itself.
   * @param song - Input song
   * @returns The url of the audio stream
   */
  abstract getStreamURL<T>(song: Song<T>): Awaitable<string>;
}
