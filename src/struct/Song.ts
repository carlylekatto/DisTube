import type { GuildMember } from "discord.js";
import type { DisTubePlugin, ResolveOptions, SongInfo } from "../type";
import { formatDuration, isMemberInstance } from "../util";
import { DisTubeError } from "./DisTubeError";
import { Playlist } from "./Playlist";

/**
 * Class representing a song.
 */
export class Song<T = unknown> {
  /**
   * The source of this song info
   */
  source: string;
  /**
   * Song ID.
   */
  id: string;
  /**
   * Song name.
   */
  name?: string;
  /**
   * Indicates if the song is an active live.
   */
  isLive?: boolean;
  /**
   * Song duration.
   */
  duration: number;
  /**
   * Formatted duration string (`hh:mm:ss`, `mm:ss` or `Live`).
   */
  formattedDuration: string;
  /**
   * Song URL.
   */
  url?: string;
  /**
   * Song thumbnail.
   */
  thumbnail?: string;
  /**
   * Song view count
   */
  views?: number;
  /**
   * Song like count
   */
  likes?: number;
  /**
   * Song dislike count
   */
  dislikes?: number;
  /**
   * Song repost (share) count
   */
  reposts?: number;
  /**
   * Song uploader
   */
  uploader: {
    /**
     * The name of the uploader.
     */
    name?: string;
    /**
     * The URL of the uploader.
     */
    url?: string;
  };
  /**
   * Whether or not an age-restricted content
   */
  ageRestricted?: boolean;
  /**
   * Stream info
   */
  stream:
    | {
        /**
         * The stream of this song will be played from source
         */
        playFromSource: true;
        /**
         * Stream URL of this song
         */
        url?: string;
      }
    | {
        /**
         * The stream of this song will be played from another song
         */
        playFromSource: false;
        /**
         * The song that this song will be played from
         */
        song?: Song<T>;
      };
  /**
   * The plugin that created this song
   */
  plugin: DisTubePlugin | null;
  #metadata!: T;
  #member?: GuildMember;
  #playlist?: Playlist;
  /**
   * Create a Song
   *
   * @param info      - Raw song info
   * @param options   - Optional data
   * @param options.member   - The user that requested the song
   * @param options.metadata - The metadata of the song
   */
  constructor(info: SongInfo<T>, { member, metadata }: ResolveOptions<T> = {}) {
    this.source = info.source.toLowerCase();
    this.metadata = (metadata ?? info.metadata) as T;
    this.member = member;
    this.id = info.id;
    this.name = info.name;
    this.isLive = info.isLive;
    this.duration = this.isLive || !info.duration ? 0 : info.duration;
    this.formattedDuration = this.isLive ? "Live" : formatDuration(this.duration);
    this.url = info.url;
    this.thumbnail = info.thumbnail;
    this.views = info.views;
    this.likes = info.likes;
    this.dislikes = info.dislikes;
    this.reposts = info.reposts;
    this.uploader = {
      name: info.uploader?.name,
      url: info.uploader?.url,
    };
    this.ageRestricted = info.ageRestricted;
    // A plugin that cannot play its own songs never has a stream: its songs are
    // resolved to a playable version by another plugin.
    this.stream = { playFromSource: info.playFromSource && info.plugin?.playable !== false };
    this.plugin = info.plugin;
  }

  /**
   * The playlist this song belongs to
   */
  get playlist() {
    return this.#playlist;
  }

  /**
   * Set the playlist this song belongs to.
   * @param playlist - The playlist
   * @throws {@link DisTubeError} When the value is not a {@link Playlist}
   */
  set playlist(playlist: Playlist | undefined) {
    if (!(playlist instanceof Playlist)) throw new DisTubeError("INVALID_TYPE", "Playlist", playlist, "Song#playlist");
    this.#playlist = playlist;
    this.member = playlist.member;
  }

  /**
   * User requested to play this song.
   */
  get member() {
    return this.#member;
  }

  /**
   * Set the user that requested this song.
   *
   * The value is ignored when it is not a valid guild member.
   * @param member - The member
   */
  set member(member: GuildMember | undefined) {
    if (isMemberInstance(member)) this.#member = member;
  }

  /**
   * User requested to play this song.
   */
  get user() {
    return this.member?.user;
  }

  /**
   * Optional metadata that can be used to identify the song. This is attached by the
   * {@link DisTube#play} method.
   */
  get metadata() {
    return this.#metadata;
  }

  /**
   * Set the metadata of the song.
   * @param metadata - The metadata
   */
  set metadata(metadata: T) {
    this.#metadata = metadata;
  }

  /**
   * The name of the song, or its url, or its id.
   * @returns The string representation of the song
   */
  toString() {
    return this.name || this.url || this.id || "Unknown";
  }
}
