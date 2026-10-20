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

### 4.3 Stream — one shared local server

The v5 contract only accepts a URL, so a plugin that cannot hand out a static
URL has to run its own HTTP server. The `coz` bot runs three of them: the
YouTube SABR proxy, the Spotify PCM proxy and the Monochrome FLAC decryptor.

That has three problems:

- every server has to be closed by hand, and a hot reload that replaces a
  plugin instance without disposing it leaks the socket
- a fixed port makes the next instance fail with `EADDRINUSE`, which is an
  unhandled `error` event and crashes the bot
- none of them support HTTP `Range`, so FFmpeg's `reconnect` restarts the
  track from the beginning instead of resuming it

DisTube therefore provides **one** server, and the plugins register their
handlers on it:

```ts
export interface StreamRequest {
  /** The path after the source, e.g. "v/abc123". */
  path: string;
  /** The parsed query parameters. */
  query: URLSearchParams;
  /** The byte offset the client asked for, or 0. */
  offset: number;
  /** Aborted when the client disconnects. */
  signal: AbortSignal;
}

export interface StreamResponse {
  /** The audio bytes. */
  body: Readable | AsyncIterable<Uint8Array>;
  /** The content type. Default: "application/octet-stream". */
  contentType?: string;
  /** The total size of the stream, when it is known. */
  size?: number;
  /** Extra headers. */
  headers?: Record<string, string | number>;
}

export type StreamHandler = (
  req: StreamRequest,
) => Promise<StreamResponse | null | void> | StreamResponse | null | void;

export interface Disposable {
  dispose(): void;
}

export class StreamServer {
  /** Register a source. Returns a handle to unregister it. */
  register(source: string, handler: StreamHandler): Disposable;
  /** Build the URL of a stream. */
  url(source: string, path?: string, query?: Record<string, string | number | boolean>): string;
  /** The base URL, e.g. "http://127.0.0.1:51234". */
  get baseUrl(): string;
  /** Close the server and dispose every handler. */
  close(): Promise<void>;
}
```

```ts
// On the plugin, like `this.distube`
get streams(): StreamServer;
```

The URL scheme is `http://127.0.0.1:<port>/<source>/<path>?<query>`.

**How a plugin uses it:**

```ts
class YoutubePlugin extends ExtractorPlugin {
  #route?: Disposable;

  init(distube: DisTube) {
    super.init(distube);
    this.#route = distube.streams.register("youtube", async ({ path, offset, signal }) => {
      const videoId = path.replace(/^v\//, "");
      const { body, contentType, size } = await this.#sabrAudio(videoId, { offset, signal });
      return { body, contentType, size };
    });
  }

  destroy() {
    this.#route?.dispose();
  }

  getStreamURL(song: Song) {
    return this.streams.url("youtube", `v/${song.id}`);
  }
}
```

The plugin does not create, bind or close a server any more: DisTube owns it,
and `DisTube#destroy()` closes it.

**What it solves**

| Problem | Before | After |
| --- | --- | --- |
| Number of servers | 3 | 1 |
| Socket leak on hot reload | yes | no, `DisTube#destroy()` closes it |
| `EADDRINUSE` on reload | yes (fixed port) | no (ephemeral port) |
| FFmpeg `reconnect` | restarts the track | resumes, once `Range` is supported |
| Secret in the URL (`?key=`) | yes | can be moved to a header |
| URL scheme | one per plugin | one for everybody |

**It is additive.** `getStreamURL()` keeps working exactly as before, so a
plugin that keeps its own server is not broken. The migration is three lines:

```js
// Before
init(distube) {
  this.server = createServer(...);
  this.server.listen(this.port, "127.0.0.1", cb);
}
destroy() { this.server.close(); }
getStreamURL(song) { return `http://127.0.0.1:${this.port}/stream?v=${song.id}`; }

// After
init(distube) {
  this.#route = distube.streams.register("youtube", handler);
}
destroy() { this.#route.dispose(); }
getStreamURL(song) { return this.streams.url("youtube", `v/${song.id}`); }
```

**Security**

- the server binds `127.0.0.1` only
- an optional random path prefix makes the URL unguessable for the other local
  processes
- secrets (the Monochrome AES key) can be passed through a header instead of
  the query string, using the `ffmpeg.args.input.headers` option

**HTTP `Range` is not part of v6.** Answering a `Range` request requires the
handler to be able to **resume** from an offset, which is possible for the
Monochrome FLAC decryptor (AES-CTR is seekable) and for the SABR stream (at a
segment boundary), but not for the Spotify PCM capture (it is generated live).
Until every handler can do it, the server answers `200` and FFmpeg restarts
the track from the beginning, like today.

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
    this.#route = distube.streams.register("youtube", handler);
  }

  async destroy() {
    this.#route?.dispose();
  }
}
```

### 5.3 Stream

```js
// Before: a local HTTP server per plugin
init(distube) {
  this.server = createServer(...);
  this.server.listen(4242, "127.0.0.1", cb);
}
destroy() { this.server.close(); }
getStreamURL(song) { return `http://127.0.0.1:${this.port}/stream?v=${song.id}`; }

// After: the shared server of DisTube
init(distube) {
  this.#route = distube.streams.register("youtube", handler);
}
destroy() { this.#route.dispose(); }
getStreamURL(song) { return this.streams.url("youtube", `v/${song.id}`); }
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
| `Plugin#streams` added | No | New optional getter |
| `ExtractorPlugin#search()` added | No | Default implementation delegates to `searchSong()` |
| `SearchOptions` added | No | New type |
| `DisTube#search()` added | No | New method |
| `StreamServer` added | No | New class; `getStreamURL()` keeps working without it |
| `PluginError` / `PluginErrorCode` added | No | New code; the existing codes keep working |
| `SongInfo#metadata` | No | Already merged in `feat/v6-foundation` |
| `DisTubeError.withMessage()` | No | Already merged in `feat/v6-foundation` |
| `Song#stream` accepts a `Readable` | No | The URL path is unchanged |
| The merge of `InfoExtractorPlugin` into `ExtractorPlugin` | **Yes** | The class stays as a deprecated alias in v6 |
| Removal of the v5 deprecations | **Yes** | Already announced for v6.0 |

**Every item is additive.** The only breaking change in v6 stays the one that
was already announced: the removal of the deprecated shortcut methods.

---

## 7. Decisions

The open questions have been answered:

1. **`search()` returns `Song[]`.** The search APIs of every source already
   return everything a `Song` needs, so it costs nothing, and it removes the
   second round trip: today a bot has to search, throw the result away, keep
   the URL and resolve it again to play it. `SearchResult` carries the songs
   and, optionally, a playlist.
2. **The source routing syntax stays in the bot.** The core provides the
   capability — `plugin.source`, `plugin.aliases`, `distube.getPlugin()` and
   the `source` option — but the `<source>:` prefix is a user interface
   decision, not a library one. The bot keeps one parser instead of eight.
3. **`InfoExtractorPlugin` and `PlayableExtractorPlugin` are merged into
   `ExtractorPlugin`.** The distinction is replaced by the `playable` flag and
   by the duck-typed `createSearchQuery()`, and the resolution path stops
   filtering on `plugin.type`. The proxy also gets a **fallback chain**: every
   searchable plugin is tried in order, instead of only the first one.
4. **The shared stream server is part of v6.** It removes three servers, the
   socket leaks and the `EADDRINUSE` crash.
5. **HTTP `Range` is not part of v6.** It needs every handler to be able to
   resume from an offset, which the Spotify PCM capture cannot do.

## 8. Implementation order

| Step | Item | Depends on |
| --- | --- | --- |
| 1 | `Plugin#destroy()`, `DisTube#destroy()` disposing the plugins | — (done in `feat/v6-foundation`) |
| 2 | `SongInfo#metadata`, `DisTubeError.withMessage()` | — (done in `feat/v6-foundation`) |
| 3 | `Plugin#source` / `#aliases`, `distube.getPlugin()` | — |
| 4 | `SearchOptions`, `ExtractorPlugin#search()`, `SearchResult`, `distube.search()` | 3 |
| 5 | The `source` option of `SearchOptions` and of `PlayOptions` | 3, 4 |
| 6 | `PluginError` / `PluginErrorCode` | — |
| 7 | `StreamServer`, `Plugin#streams`, `Disposable` | — |
| 8 | The removal of the v5 deprecations | — |
| 9 | The merge of `InfoExtractorPlugin` into `ExtractorPlugin`, and the fallback chain | 4 |
| 10 | HTTP `Range` in the stream server | 7, and every handler being able to resume |

> The `coz` bot can already use step 3, 4 and 5 through the new
> `musicError()` helper and the `source` field of the plugins, without
> waiting for a release: the bot is the only consumer.
