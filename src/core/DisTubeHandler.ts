import { request } from "undici";
import { HTTP_REDIRECT_CODES, MAX_REDIRECT_DEPTH } from "../constant";
import { DisTubeError } from "../struct/DisTubeError";
import type { ExtractorPlugin } from "../struct/ExtractorPlugin";
import { Playlist } from "../struct/Playlist";
import { Song } from "../struct/Song";
import type { DisTubePlugin, ResolveOptions } from "../type";
import { PluginType } from "../type";
import { isURL } from "../util";
import { DisTubeBase } from "./DisTubeBase";

/**
 * DisTube's Handler
 */
export class DisTubeHandler extends DisTubeBase {
  /**
   * Resolve a {@link Song} to a {@link Song}.
   * @param song    - The song to resolve
   * @param options - Optional options
   * @returns The resolved song
   */
  resolve<T = unknown>(song: Song<T>, options?: Omit<ResolveOptions, "metadata">): Promise<Song<T>>;
  /**
   * Resolve a {@link Playlist} to a {@link Playlist}.
   * @param song    - The playlist to resolve
   * @param options - Optional options
   * @returns The resolved playlist
   */
  resolve<T = unknown>(song: Playlist<T>, options?: Omit<ResolveOptions, "metadata">): Promise<Playlist<T>>;
  /**
   * Resolve a url or a search query to a {@link Song} or a {@link Playlist}.
   * @param song    - The url or the search query to resolve
   * @param options - Optional options
   * @returns The resolved song or playlist
   */
  resolve<T = unknown>(song: string, options?: ResolveOptions<T>): Promise<Song<T> | Playlist<T>>;
  /**
   * Resolve a {@link Song} to a {@link Song}.
   * @param song    - The song to resolve
   * @param options - Optional options
   * @returns The resolved song
   */
  resolve<T = unknown>(song: Song, options: ResolveOptions<T>): Promise<Song<T>>;
  /**
   * Resolve a {@link Playlist} to a {@link Playlist}.
   * @param song    - The playlist to resolve
   * @param options - Optional options
   * @returns The resolved playlist
   */
  resolve<T = unknown>(song: Playlist, options: ResolveOptions<T>): Promise<Playlist<T>>;
  /**
   * Resolve a url or a supported object to a {@link Song} or {@link Playlist}
   * @throws {@link DisTubeError}
   * @param song    - Resolvable input
   * @param options - Optional options
   * @returns Resolved
   * @example
   * ```ts
   * const song = await distube.handler.resolve("Never gonna give you up");
   * ```
   */
  resolve(song: string | Song | Playlist, options?: ResolveOptions): Promise<Song | Playlist>;
  /**
   * Resolve a url or a supported object to a {@link Song} or {@link Playlist}
   * @throws {@link DisTubeError}
   * @param input   - Resolvable input
   * @param options - Optional options
   * @returns Resolved
   */
  async resolve(input: string | Song | Playlist, options: ResolveOptions = {}): Promise<Song | Playlist> {
    if (input instanceof Song || input instanceof Playlist) {
      if ("metadata" in options) input.metadata = options.metadata;
      if ("member" in options) input.member = options.member;
      return input;
    }
    if (typeof input === "string") {
      if (isURL(input)) {
        const plugin =
          (await this._getPluginFromURL(input)) ||
          (await this._getPluginFromURL((input = await this.followRedirectLink(input))));
        if (!plugin) throw new DisTubeError("NOT_SUPPORTED_URL");
        this.debug(`[${plugin.constructor.name}] Resolving from url: ${input}`);
        return plugin.resolve(input, options);
      }
      try {
        const song = await this.#searchSong(input, options);
        if (song) return song;
      } catch (e: unknown) {
        // Keep the original error as the cause so that it is not lost.
        const error = new DisTubeError("NO_RESULT", input);
        error.cause = e;
        throw error;
      }
    }
    throw new DisTubeError("CANNOT_RESOLVE_SONG", input);
  }

  /**
   * Find the plugin that supports the given url.
   * @param url - The url to check
   * @returns The plugin, or `null` when there is none
   */
  async _getPluginFromURL(url: string): Promise<DisTubePlugin | null> {
    for (const plugin of this.plugins) if (await plugin.validate(url)) return plugin;
    return null;
  }

  /**
   * Find the plugin that can handle the given song.
   * @param song - The song
   * @returns The plugin, or `null` when there is none
   */
  _getPluginFromSong(song: Song): Promise<DisTubePlugin | null>;
  /**
   * Find the plugin of the given type that can handle the given song.
   * @param song     - The song
   * @param types    - The types of the plugin to look for
   * @param validate - Whether the url of the song has to be validated
   * @returns The plugin, or `null` when there is none
   */
  _getPluginFromSong<T extends PluginType>(
    song: Song,
    types: T[],
    validate?: boolean,
  ): Promise<(DisTubePlugin & { type: T }) | null>;
  async _getPluginFromSong<T extends PluginType>(
    song: Song,
    types?: T[],
    validate = true,
  ): Promise<(DisTubePlugin & { type: T }) | null> {
    if (!types || types.includes(<T>song.plugin?.type)) return song.plugin as DisTubePlugin & { type: T };
    if (!song.url) return null;
    for (const plugin of this.plugins) {
      if ((!types || types.includes(<T>plugin?.type)) && (!validate || (await plugin.validate(song.url)))) {
        return plugin as DisTubePlugin & { type: T };
      }
    }
    return null;
  }

  async #searchSong(query: string, options: ResolveOptions = {}, getStreamURL = false): Promise<Song | null> {
    const source = options.source?.toLowerCase();
    const plugins = this.plugins.filter(
      (plugin): plugin is ExtractorPlugin =>
        plugin.type === PluginType.EXTRACTOR && (!source || plugin.identifiers.includes(source)),
    );
    if (!plugins.length) throw new DisTubeError("NO_EXTRACTOR_PLUGIN");
    for (const plugin of plugins) {
      this.debug(`[${plugin.constructor.name}] Searching for song: ${query}`);
      const result = await plugin.searchSong(query, options);
      if (result) {
        if (getStreamURL && result.stream.playFromSource) result.stream.url = await plugin.getStreamURL(result);
        return result;
      }
    }
    return null;
  }

  /**
   * Get {@link Song}'s stream info and attach it to the song.
   * @param song - A Song
   * @returns A promise that resolves when the stream info is attached
   * @throws {@link DisTubeError} When no plugin supports the song, or when its
   * stream URL cannot be found
   */
  async attachStreamInfo(song: Song) {
    if (song.stream.playFromSource) {
      if (song.stream.url) return;
      this.debug(`[DisTubeHandler] Getting stream info: ${song}`);
      const plugin = await this._getPluginFromSong(song, [PluginType.EXTRACTOR, PluginType.PLAYABLE_EXTRACTOR]);
      if (!plugin) throw new DisTubeError("NOT_SUPPORTED_SONG", song.toString());
      this.debug(`[${plugin.constructor.name}] Getting stream URL: ${song}`);
      song.stream.url = await plugin.getStreamURL(song);
      if (!song.stream.url) throw new DisTubeError("CANNOT_GET_STREAM_URL", song.toString());
    } else {
      if (song.stream.song?.stream?.playFromSource && song.stream.song.stream.url) return;
      this.debug(`[DisTubeHandler] Getting stream info: ${song}`);
      // The song comes from a plugin that cannot play it: look for a playable
      // version of it with the other plugins.
      const source = song.plugin;
      const query = source
        ? await source.createSearchQuery(song)
        : `${song.name ?? ""} ${song.uploader?.name ?? ""}`.trim();
      if (!query) throw new DisTubeError("CANNOT_GET_SEARCH_QUERY", song.toString());
      const altSong = await this.#findPlayableSong(query, song, source);
      song.stream.song = altSong;
    }
  }

  /**
   * Look for a playable version of a song with the plugins that can search.
   *
   * Every searchable plugin is tried, in the order they were registered, until
   * one of them has a result.
   * @param query  - The search query
   * @param song   - The song that cannot be played
   * @param source - The plugin that resolved the song
   * @returns The playable song
   */
  async #findPlayableSong(query: string, song: Song, source: DisTubePlugin | null): Promise<Song> {
    const options: ResolveOptions = { metadata: song.metadata, member: song.member };
    for (const plugin of this.plugins) {
      if (plugin === source) continue;
      const result = await plugin.searchSong(query, options);
      if (!result) continue;
      this.debug(`[${plugin.constructor.name}] Found a playable version of "${query}"`);
      if (result.stream.playFromSource) result.stream.url = await plugin.getStreamURL(result);
      return result;
    }
    throw new DisTubeError("NO_RESULT", query);
  }

  /**
   * Follow the redirections of an url.
   * @param url        - The url to follow
   * @param maxRedirect - The maximum number of redirections to follow
   * @returns The final url
   */
  async followRedirectLink(url: string, maxRedirect = MAX_REDIRECT_DEPTH): Promise<string> {
    if (maxRedirect === 0) return url;

    const res = await request(url, {
      method: "HEAD",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/129.0.0.0 Safari/537.3",
      },
    });

    if (HTTP_REDIRECT_CODES.has(res.statusCode ?? 200)) {
      let location = res.headers.location;
      if (typeof location !== "string") location = location?.[0] ?? url;
      return this.followRedirectLink(location, --maxRedirect);
    }

    return url;
  }
}
