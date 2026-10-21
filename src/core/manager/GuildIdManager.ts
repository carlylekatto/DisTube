import type { GuildIdResolvable } from "../..";
import { resolveGuildId } from "../..";
import { BaseManager } from "./BaseManager";

/**
 * Manages the collection of a data model paired with a guild id.
 */
export abstract class GuildIdManager<V> extends BaseManager<V> {
  /**
   * Add an item to the collection.
   *
   * The item is not added when there is already one for the same guild.
   * @param idOrInstance - The guild id, or anything that can be resolved to a guild id
   * @param data         - The item to add
   * @returns This manager, to allow chaining
   * @throws {@link DisTubeError} When the value cannot be resolved to a guild id
   */
  add(idOrInstance: GuildIdResolvable, data: V) {
    const id = resolveGuildId(idOrInstance);
    const existing = this.get(id);
    if (existing) return this;
    this.collection.set(id, data);
    return this;
  }
  /**
   * Get the item of a guild.
   * @param idOrInstance - The guild id, or anything that can be resolved to a guild id
   * @returns The item of the guild, or `undefined` when there is none
   * @throws {@link DisTubeError} When the value cannot be resolved to a guild id
   */
  get(idOrInstance: GuildIdResolvable): V | undefined {
    return this.collection.get(resolveGuildId(idOrInstance));
  }
  /**
   * Remove the item of a guild.
   * @param idOrInstance - The guild id, or anything that can be resolved to a guild id
   * @returns `true` when an item was removed, `false` otherwise
   * @throws {@link DisTubeError} When the value cannot be resolved to a guild id
   */
  remove(idOrInstance: GuildIdResolvable): boolean {
    return this.collection.delete(resolveGuildId(idOrInstance));
  }
  /**
   * Check whether a guild has an item.
   * @param idOrInstance - The guild id, or anything that can be resolved to a guild id
   * @returns `true` when there is an item for the guild
   * @throws {@link DisTubeError} When the value cannot be resolved to a guild id
   */
  has(idOrInstance: GuildIdResolvable): boolean {
    return this.collection.has(resolveGuildId(idOrInstance));
  }
}
