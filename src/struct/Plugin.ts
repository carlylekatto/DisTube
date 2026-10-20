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
   * DisTube
   */
  distube!: DisTube;
  init(distube: DisTube) {
    this.distube = distube;
  }
  /**
   * Every identifier of this plugin: its {@link Plugin.source} and its
   * {@link Plugin.aliases}, lowercased.
   */
  get identifiers(): string[] {
    const names = new Set<string>();
    const source = this.source ?? this.constructor.name.replace(/Plugin$/iu, "");
    if (source) names.add(source.toLowerCase());
    for (const alias of this.aliases ?? []) {
      if (typeof alias === "string" && alias) names.add(alias.toLowerCase());
    }
    return [...names];
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
