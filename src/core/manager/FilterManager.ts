import type { FFmpegArg as FFmpegArgsValue, Filter, FilterResolvable, Queue } from "../..";
import { DisTubeError } from "../..";
import { BaseManager } from "./BaseManager";

/**
 * Manage filters of a playing {@link Queue}
 */
export class FilterManager extends BaseManager<Filter> {
  /**
   * The queue to manage
   */
  queue: Queue;
  /**
   * Create a filter manager for a queue.
   * @param queue - The queue to manage
   */
  constructor(queue: Queue) {
    super(queue.distube);
    this.queue = queue;
  }

  #resolve(filter: FilterResolvable): Filter {
    if (typeof filter === "object" && typeof filter.name === "string" && typeof filter.value === "string") {
      return filter;
    }
    if (typeof filter === "string" && Object.hasOwn(this.distube.filters, filter)) {
      return {
        name: filter,
        value: this.distube.filters[filter],
      };
    }
    throw new DisTubeError("INVALID_TYPE", "FilterResolvable", filter, "filter");
  }

  #apply() {
    // The FFmpeg audio filters are applied when the stream is created, so the
    // stream has to be restarted. The restart never interrupts the playback for
    // good: a failure keeps the current song in the queue.
    void this.queue._restartStream().catch((e: unknown) => {
      const errorMessage = e instanceof Error ? e.message : String(e);
      this.queue.debug(`[${this.queue.id}] Failed to apply the filters: ${errorMessage}`);
    });
  }

  /**
   * Enable a filter or multiple filters to the manager
   * @param filterOrFilters - The filter or filters to enable
   * @param override        - Wether or not override the applied filter with new filter value
   * @returns This manager, to allow chaining
   * @throws {@link DisTubeError} When a filter is not a valid {@link FilterResolvable}
   * @example
   * ```ts
   * queue.filters.add("bassboost");
   * ```
   */
  add(filterOrFilters: FilterResolvable | FilterResolvable[], override = false) {
    if (Array.isArray(filterOrFilters)) {
      for (const filter of filterOrFilters) {
        const ft = this.#resolve(filter);
        if (override || !this.has(ft)) this.collection.set(ft.name, ft);
      }
    } else {
      const ft = this.#resolve(filterOrFilters);
      if (override || !this.has(ft)) this.collection.set(ft.name, ft);
    }
    this.#apply();
    return this;
  }

  /**
   * Clear enabled filters of the manager
   * @returns This manager, to allow chaining
   */
  clear() {
    return this.set([]);
  }

  /**
   * Set the filters applied to the manager
   * @param filters - The filters to apply
   * @returns This manager, to allow chaining
   * @throws {@link DisTubeError} When the array is invalid, or when a filter is
   * not a valid {@link FilterResolvable}
   */
  set(filters: FilterResolvable[]) {
    if (!Array.isArray(filters)) throw new DisTubeError("INVALID_TYPE", "Array<FilterResolvable>", filters, "filters");
    this.collection.clear();
    for (const f of filters) {
      const filter = this.#resolve(f);
      this.collection.set(filter.name, filter);
    }
    this.#apply();
    return this;
  }

  #removeFn(f: FilterResolvable) {
    return this.collection.delete(this.#resolve(f).name);
  }

  /**
   * Disable a filter or multiple filters
   * @param filterOrFilters - The filter or filters to disable
   * @returns This manager, to allow chaining
   * @throws {@link DisTubeError} When a filter is not a valid {@link FilterResolvable}
   */
  remove(filterOrFilters: FilterResolvable | FilterResolvable[]) {
    if (Array.isArray(filterOrFilters)) filterOrFilters.forEach(f => this.#removeFn(f));
    else this.#removeFn(filterOrFilters);
    this.#apply();
    return this;
  }

  /**
   * Check whether a filter enabled or not
   * @param filter - The filter to check
   * @returns `true` when the filter is enabled
   * @throws {@link DisTubeError} When the filter is not a valid {@link FilterResolvable}
   */
  has(filter: FilterResolvable) {
    return this.collection.has(typeof filter === "string" ? filter : this.#resolve(filter).name);
  }

  /**
   * Array of enabled filter names
   */
  get names(): string[] {
    return [...this.collection.keys()];
  }

  /**
   * Array of enabled filters
   */
  get values(): Filter[] {
    return [...this.collection.values()];
  }

  /**
   * The FFmpeg arguments of the enabled filters.
   *
   * It is the `af` output argument of the FFmpeg process.
   */
  get ffmpegArgs(): FFmpegArgsValue {
    return this.size ? { af: this.values.map(f => f.value).join(",") } : {};
  }

  /**
   * The names of the enabled filters, as a comma separated string.
   * @returns The names of the enabled filters
   */
  override toString() {
    return this.names.toString();
  }
}
