# Proposal — DisTube plugin API v6

> **Status:** draft, open for review
> **Target:** DisTube v6.0 (the major version that already removes the deprecated
> shortcut methods, `queue.playing`, `queue.isPlaying()` and the
> `InfoExtratorPlugin` / `PlayableExtratorPlugin` aliases)
> **Evidence:** the seven production plugins of the `katto-discord` bot
> (`coz`), which implement YouTube (SABR + BotGuard PO tokens), Spotify
> (Widevine/EME), Tidal, Deezer, SoundCloud, Bandcamp and NhacCuaTui.

---

## 1. Why

The v5 plugin API was designed for a world where a music source was "give me a
URL and FFmpeg will fetch it". That world is gone:

| Source | What it needs today |
| --- | --- |
| YouTube | SABR protocol + per-request PO tokens + BotGuard attestation |
| Spotify | Widevine license exchange (EME) + encrypted fMP4 + PCM capture |
| Tidal | Turnstile challenge + AES-128-CTR decryption |

None of them can hand out a static URL. They all have to run a **local HTTP
server** and hand FFmpeg a `http://127.0.0.1:<port>/...` URL, which the v5 API
does not model and does not let them clean up.

The v5 API also has no way to express the things the plugins actually need:

- **multi-result search** — `ExtractorPlugin#searchSong()` returns exactly one
  `Song | null`
- **a source that is not playable by itself** — `InfoExtractorPlugin` exists for
  that, but the resolution path filters on `plugin.type === "info-extractor"`,
  so an `ExtractorPlugin` that also implements `createSearchQuery()` is dead code
- **a lifecycle** — `Plugin` has `init()` and nothing else, so a plugin cannot
  release its HTTP server, its timers or its browser session
- **a registry** — a plugin that needs another plugin has to sniff
  `plugin.constructor.name`

Every one of those gaps has a workaround in the `coz` codebase, and the
workarounds are duplicated seven times over.

---

## 2. Goals

1. A plugin can return **many** search results, with a **typed** result object.
2. A plugin can return a **stream** instead of a URL, so it does not need an
   HTTP server.
3. A plugin has a **lifecycle**: `init()` is awaited, `destroy()` is called.
4. A plugin can be **found** by source, without string matching on class names.
5. A plugin can attach **source specific data** to a `Song` in a supported way.
6. A plugin can raise an error with a **custom message** and a **typed code**.

## 3. Non-goals

- Replacing the `Queue` API (repeat modes, queue manipulation, policies) —
  that is a separate proposal.
- Adding lyrics, SponsorBlock or chapters to the core. They belong to plugins.
- Changing how a `Song` is played. The playback pipeline stays the same.

---

## 4. The API

### 4.1 Lifecycle

```ts
export abstract class Plugin {
  abstract readonly type: PluginType;
  distube!: DisTube;

  /**
   * Called once, when the plugin is registered.
   * It is awaited: a plugin can do async work here (network calls, sessions).
   */
  init(distube: DisTube): void | Promise<void>;

  /**
   * Called when the DisTube instance is destroyed, and when a plugin is
   * replaced at runtime. Release every resource here.
   */
  destroy(): void | Promise<void>;

  /**
   * Override to enable the autoplay for your source.
   */
  getRelatedSongs(song: Song): Awaitable<Song[]>;
}
```

**Breaking change:** `init()` becomes awaitable. `DisTube` gains an async
factory:

```ts
const distube = await DisTube.create(client, { plugins: [...] });
```

The existing constructor keeps working and calls `init()` without awaiting, for
backwards compatibility. A `DisTubeOptions.awaitPlugins?: boolean` flag is **not**
added: the ambiguity is worse than the migration cost. Plugins that need async
init either use `DisTube.create()` or expose a `ready` promise.

**Breaking change:** `destroy()` is called by `DisTube#destroy()`:

```ts
await distube.destroy();
// stops every queue, leaves every voice, destroys every plugin
```

### 4.2 Search

```ts
export interface SearchOptions<T = unknown> extends ResolveOptions<T> {
  /** Maximum number of results. Default: 10 */
  limit?: number;
  /** The kind of result the caller is looking for. */
  type?: SearchResultType;
  /** Whether to filter the explicit/inappropriate content. Default: false */
  safeSearch?: boolean;
}

export enum SearchResultType {
  TRACK = "track",
  VIDEO = "video",
  PLAYLIST = "playlist",
  ALBUM = "album",
  ARTIST = "artist",
}
```

```ts
export abstract class ExtractorPlugin extends Plugin {
  /**
   * Search for songs.
   *
   * The default implementation falls back to searchSong(), so the existing
   * plugins keep working unchanged.
   */
  async search<T>(query: string, options: SearchOptions<T>): Promise<Song<T>[]> {
    const song = await this.searchSong(query, options);
    return song ? [song] : [];
  }
}
```

`searchSong()` stays, but is documented as "the single result shortcut of
`search()`".

At the DisTube level:

```ts
export class SearchResult<T = unknown> {
  readonly query: string;
  readonly queryType: SearchResultType;
  readonly songs: Song<T>[];
  readonly playlist?: Playlist<T>;

  isEmpty(): boolean;
  hasSongs(): boolean;
  hasPlaylist(): boolean;
  toJSON(): object;
}

distube.search(query: string, options?: SearchOptions): Promise<SearchResult>;
```

**Source routing.** The `coz` bot has seven copies of the same prefix parser
(`<source>: <query>`, `<query> --<source>`, `-s <source>`). It moves to the
core:

```ts
// "bc: sunset"      -> BandcampPlugin
// "sunset --bc"     -> BandcampPlugin
// "sunset --all"    -> every plugin, results merged
// "sunset"          -> every plugin, in registration order
distube.search("bc: sunset");
```

The routing is driven by a `source` field the plugin declares:

```ts
export abstract class Plugin {
  /**
   * The identifier of the source, used to route a search to this plugin.
   * Default: the lowercased class name without the "Plugin" suffix.
   */
  readonly source?: string;
  /**
   * Additional identifiers, e.g. "yt" for YouTube.
   */
  readonly aliases?: string[];
}
```

### 4.3 Stream

```ts
export abstract class PlayableExtractorPlugin extends Plugin {
  /**
   * Get the playable stream of a song.
   *
   * Return a URL, or a readable stream. The default implementation calls
   * getStreamURL().
   */
  async getStream<T>(song: Song<T>): Promise<Readable | string> {
    return this.getStreamURL(song);
  }

  abstract getStreamURL<T>(song: Song<T>): Awaitable<string>;
}
```

Returning a `Readable` removes the need for a local HTTP server:

```ts
// Before: the plugin runs an HTTP server and hands FFmpeg a 127.0.0.1 URL
async getStreamURL(song) {
  return `http://127.0.0.1:${this.port}/stream?v=${song.id}`;
}

// After: the plugin hands the stream over directly
async getStream(song) {
  return this.sabrStream(song.id);   // a Readable
}
```

`DisTubeStream` accepts a `Readable` in addition to a URL. The FFmpeg process
then reads from the pipe instead of opening a socket.

> **Trade-off:** a `Readable` cannot be replayed, and FFmpeg cannot `seek` on
> it. The seek offset is still applied through the FFmpeg `-ss` argument, which
> works on a pipe. Plugins that need a seekable source (a local file) keep
> returning a URL.

### 4.4 Registry

```ts
distube.getPlugin(source: string): DisTubePlugin | undefined;
distube.pluginsByType(type: PluginType): DisTubePlugin[];
```

This replaces the `constructor.name === "YoutubePlugin"` sniffing. A plugin
that needs another plugin declares the dependency instead:

```ts
export abstract class ExtractorPlugin extends Plugin {
  /**
   * The plugins this one needs, by source.
   */
  readonly requires?: string[];
}
```

`DisTube` resolves the dependencies and gives them to the plugin:

```ts
protected getDependency<T extends DisTubePlugin>(source: string): T | undefined;
```

### 4.5 Song metadata

The v5 `Song` constructor only reads the metadata from the **options**
argument, so a plugin that puts its data in `SongInfo` loses it. v6 accepts
both:

```ts
export interface SongInfo<T = unknown> {
  // ...
  /**
   * Source specific data of the song (stream url, identifiers, ...).
   * Merged with the metadata given to DisTube#play().
   */
  metadata?: T;
}
```

The merge order is **the plugin wins**, which is what the ecosystem already
does by hand:

```ts
this.metadata = { ...options.metadata, ...info.metadata } as T;
```

> This is already implemented in the `feat/v6-foundation` branch, and it fixes
> the `spotifyUri` loss and the dead stream cache of the NCT plugin.

### 4.6 Errors

The error codes are a closed table, and the plugins need their own:

```ts
export enum PluginErrorCode {
  /** The URL is not supported by the plugin */
  UNSUPPORTED_URL = "UNSUPPORTED_URL",
  /** The song could not be resolved */
  NOT_FOUND = "NOT_FOUND",
  /** The plugin could not get a playable stream */
  NO_STREAM = "NO_STREAM",
  /** The source is temporarily unavailable (rate limit, 5xx, ...) */
  SOURCE_UNAVAILABLE = "SOURCE_UNAVAILABLE",
  /** The content is not playable because of the age restriction */
  AGE_RESTRICTED = "AGE_RESTRICTED",
}

export class PluginError extends DisTubeError {}
```

And a custom message is supported without abusing the template arguments:

```ts
DisTubeError.withMessage("CANNOT_RESOLVE_SONG", "Không tìm thấy bài hát trên SoundCloud");
```

> Also already implemented in the `feat/v6-foundation` branch.

---

## 5. Migration guide

### 5.1 Search

**Before** (every plugin, seven copies):

```js
async search(query, options = {}) {
  const limit = options.limit || 10;
  const result = await this.client.search(query, { limit });
  return result.tracks.slice(0, limit).map(t => ({
    id: t.id, name: t.title, uploader: { name: t.artist, url: "" },
    duration: t.duration, formattedDuration: "3:33",
    url: t.url, thumbnail: t.cover, source: "spotify",
  }));
}
```

**After:**

```js
async search(query, options = {}) {
  const result = await this.client.search(query, { limit: options.limit ?? 10 });
  return result.tracks.map(t => new SpotifySong(this, t, options));
}
```

The result is a real `Song`, so it can be played without a second round trip:

```js
const result = await distube.search("never gonna give you up");
await distube.play(channel, result.songs[0], { member });
```

**Delete:** the seven copies of `getPluginSearchPatterns()` and the
`client.distube.search` monkey patch in `src/index.js`.

### 5.2 Lifecycle

```js
class YoutubePlugin extends ExtractorPlugin {
  async init(distube) {
    super.init(distube);
    await this.createSession();
    this.server = createServer(...);
    await new Promise(resolve => this.server.listen(0, "127.0.0.1", resolve));
  }

  async destroy() {
    clearInterval(this.poTokenTimer);
    await new Promise(resolve => this.server.close(resolve));
  }
}
```

### 5.3 Stream

```js
// Before: a local HTTP server
async getStreamURL(song) {
  return `http://127.0.0.1:${this.port}/stream?v=${song.id}`;
}

// After: the stream itself
async getStream(song) {
  return this.sabrStream(song.id);
}
```

### 5.4 Cross-plugin dependencies

```js
// Before
const yt = this.distube.plugins.find(p => p.constructor.name === "YoutubePlugin");

// After
const yt = this.getDependency("youtube");
```

### 5.5 Errors

```js
// Before
throw new DisTubeError("INVALID_URL", "Không thể nhận diện URL Spotify");
// -> "Cannot resolve "Không thể nhận diện URL Spotify" to a Song"

// After
throw musicError("UNSUPPORTED_URL", "Không thể nhận diện URL Spotify");
```

---

## 6. Compatibility

| Change | Breaking | Mitigation |
| --- | --- | --- |
| `Plugin#destroy()` added | No | New optional method with a default no-op |
| `Plugin#init()` may be async | No | `DisTube.create()` awaits it; the constructor keeps the old behaviour |
| `Plugin#source` / `#aliases` added | No | New optional fields |
| `ExtractorPlugin#search()` added | No | Default implementation delegates to `searchSong()` |
| `SearchOptions` added | No | New type |
| `DisTube#search()` added | No | New method |
| `PluginError` / `PluginErrorCode` added | No | New code; the existing codes keep working |
| `SongInfo#metadata` | No | Already merged in `feat/v6-foundation` |
| `DisTubeError.withMessage()` | No | Already merged in `feat/v6-foundation` |
| `getStream()` added | No | Default implementation delegates to `getStreamURL()` |
| `Song#stream` accepts a `Readable` | No | The URL path is unchanged |
| Removal of the v5 deprecations | **Yes** | Already announced for v6.0 |

**Every item is additive.** The only breaking change in v6 stays the one that
was already announced: the removal of the deprecated shortcut methods.

---

## 7. Open questions

1. **Should `search()` return `Song[]` or a dedicated `SearchResultItem[]`?**
   `Song[]` keeps one type, but it forces the plugin to build a full `Song`
   (metadata, uploader, thumbnail) for every result, even when the caller only
   wants a list to display.
2. **Should the source routing syntax be part of the core?** The `<source>:`
   prefix is a `coz` convention, but it is useful for every bot that has more
   than one source. It could also stay in the bot and only use the `source`
   field of the plugin.
3. **Should `getStream()` be the only contract?** `getStreamURL()` could be
   removed and replaced by `getStream()`, but a URL is still the simplest thing
   for a plain HTTP source (and for a local file).
4. **How to expose the "I am not playable by myself" role?** Today
   `InfoExtractorPlugin` is a separate class, and the resolution path filters
   on `plugin.type`. A single `ExtractorPlugin` with a
   `playable: false` flag, or a `resolveTo()` method that returns a playable
   song, would be simpler. The `coz` Lyra and Monochrome plugins both need
   this: their audio is really YouTube's.
5. **Should the `Playlist` model gain a `selectedTrack`?** The `coz` bot
   cannot express "play the playlist starting from the track N".

---

## 8. Implementation order

| Step | Item | Depends on |
| --- | --- | --- |
| 1 | `Plugin#destroy()`, `DisTube#destroy()` disposing the plugins | — (done in `feat/v6-foundation`) |
| 2 | `SongInfo#metadata`, `DisTubeError.withMessage()` | — (done in `feat/v6-foundation`) |
| 3 | `Plugin#source` / `#aliases`, `distube.getPlugin()` | — |
| 4 | `SearchOptions`, `ExtractorPlugin#search()`, `SearchResult`, `distube.search()` | 3 |
| 5 | Source routing (`<source>:`, `--<source>`, `--all`) | 4 |
| 6 | `PluginError` / `PluginErrorCode` | — |
| 7 | `getStream()` returning a `Readable`, `DisTubeStream` accepting a `Readable` | — |
| 8 | `Plugin#requires` / `getDependency()` | 3 |
| 9 | The removal of the v5 deprecations | — |
