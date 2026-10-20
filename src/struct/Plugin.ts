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
}
