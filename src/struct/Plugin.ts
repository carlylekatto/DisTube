import type { DisTube } from "../DisTube";
import type { Awaitable, PluginType } from "../type";
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
   * DisTube
   */
  distube!: DisTube;
  init(distube: DisTube) {
    this.distube = distube;
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
