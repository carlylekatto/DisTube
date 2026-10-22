import type { GuildMember } from "discord.js";
import type { PlaylistInfo, ResolveOptions } from "../type";
import { formatDuration, isMemberInstance } from "../util";
import { DisTubeError } from "./DisTubeError";
import type { Song } from "./Song";

/**
 * Class representing a playlist.
 */
export class Playlist<T = unknown> implements PlaylistInfo {
  /**
   * Playlist source.
   */
  source: string;
  /**
   * Songs in the playlist.
   */
  songs: Song[];
  /**
   * Playlist ID.
   */
  id?: string;
  /**
   * Playlist name.
   */
  name?: string;
  /**
   * Playlist URL.
   */
  url?: string;
  /**
   * Playlist thumbnail.
   */
  thumbnail?: string;
  #metadata!: T;
  #member?: GuildMember;
  /**
   * Create a Playlist
   * @param playlist  - Raw playlist info
   * @param options   - Optional data
   * @param options.member   - The user that requested the playlist
   * @param options.metadata - The metadata of the playlist
   * @throws {@link DisTubeError} When the playlist does not have any song
   */
  constructor(playlist: PlaylistInfo, { member, metadata }: ResolveOptions<T> = {}) {
    if (!Array.isArray(playlist.songs) || !playlist.songs.length) throw new DisTubeError("EMPTY_PLAYLIST");

    this.source = playlist.source.toLowerCase();
    this.songs = playlist.songs;
    this.name = playlist.name;
    this.id = playlist.id;
    this.url = playlist.url;
    this.thumbnail = playlist.thumbnail;
    this.member = member;
    this.songs.forEach(s => (s.playlist = this));
    this.metadata = metadata as T;
  }

  /**
   * Playlist duration in second.
   */
  get duration() {
    return this.songs.reduce((prev, next) => prev + next.duration, 0);
  }

  /**
   * Formatted duration string `hh:mm:ss`.
   */
  get formattedDuration() {
    return formatDuration(this.duration);
  }

  /**
   * User requested.
   */
  get member() {
    return this.#member;
  }

  /**
   * Set the user that requested the playlist.
   *
   * The value is ignored when it is not a valid guild member.
   * @param member - The member
   */
  set member(member: GuildMember | undefined) {
    if (!isMemberInstance(member)) return;
    this.#member = member;
    this.songs.forEach(s => (s.member = this.member));
  }

  /**
   * User requested.
   */
  get user() {
    return this.member?.user;
  }

  /**
   * Optional metadata that can be used to identify the playlist.
   */
  get metadata() {
    return this.#metadata;
  }

  /**
   * Set the metadata of the playlist.
   *
   * The metadata of the songs is not changed when the metadata is `undefined`.
   * @param metadata - The metadata
   */
  set metadata(metadata: T) {
    this.#metadata = metadata;
    // Do not wipe the metadata of the songs when there is no metadata:
    // the songs may carry their own source specific metadata (stream url,
    // identifiers, ...) that the plugin needs to play them.
    if (metadata === undefined) return;
    this.songs.forEach(s => (s.metadata = metadata));
  }

  /**
   * The name of the playlist and the number of its songs.
   * @returns The string representation of the playlist
   */
  toString() {
    return `${this.name} (${this.songs.length} songs)`;
  }
}
