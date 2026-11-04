# Changelog

All the notable changes of DisTube are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.2.3]

This version makes a dying crossfade transition stream diagnosable instead of crashing the host
process silently.

### Fixed

- Attach an error listener to the warmed-up transition stream. A transition FFmpeg that died early
  (for example on a hostile input) used to emit on an event with no listener, crashing the host
  process with an unhandled error, before aborting the crossfade into the regular transition path.
  The queue now clears its crossfade state on the failure.
- Include the last FFmpeg stderr lines in the `FFMPEG_EXITED` error. An exit code alone (for example
  `234`, which is an `EINVAL` truncated to 8 bits on POSIX) does not explain the failure; the
  attached output names the exact FFmpeg error that killed the process.

## [6.2.2]

This version makes the crossfade viable on sources whose playlists cannot be fast-seeked. A new
`crossfade.preparePrimaryInput` option rewrites the fading-out song's FFmpeg input right before the
transition stream is spawned, so bots can replace a seek-hostile stream url with one that starts a
few seconds before the fade boundary instead.

### Added

- `crossfade.preparePrimaryInput`: an optional adapter invoked with the fading-out song's stream url
  and the fade boundary (in seconds), returning a replacement input url along with the seek offset
  inside it and its own FFmpeg input options (which replace the default streaming-oriented ones).
  Streaming inputs that cannot fast-seek — HLS playlists, for example — force FFmpeg to re-download
  the whole stream and discard everything before the seek position, which can miss the swap window
  on slow sources; the adapter lets a host trim the input down to the tail of the song beforehand.
- `CrossfadeStreamOptions.primaryInputArgs`: FFmpeg input options that replace the default options of
  the first (fading out) input of the transition stream.
- Failures inside the adapter fall back to the original url, and all flows without an adapter keep
  their previous behavior.

## [6.2.1]

This patch hardens the crossfade against slow sources. A transition stream that has not produced any
audio when the fade window opens no longer takes over the playback: the queue aborts the crossfade
and keeps the regular transition, so the song never sits in the buffering state waiting for FFmpeg.

### Fixed

- Never swap in a transition stream with no audio yet. A warmed-up crossfade stream that stayed
  silent at the fade boundary used to leave the player buffering until FFmpeg caught up, and the
  stuck-track watchdog then skipped the song on slow sources.
- Arm the fade boundary from the playback position that is read after the preload await, so a slow
  preload cannot push the swap past the drift tolerance.

## [6.2.0]

This version introduces audio crossfade between consecutive songs. Instead of a hard switch between
two streams, a queue can seamlessly mix the fading out song with the fading in song using a single
transition stream powered by FFmpeg's `acrossfade` filter.

The transition stream is pre-spawned before the fade window begins so that both inputs are buffered
ahead of time, ensuring the crossfade starts on schedule without network stalls or decoding delays.

### Added

- The `crossfade` option on DisTube, accepting an object with:
  - `duration`: the default crossfade duration in seconds for new queues (disabled by default, `0`).
  - `curve`: the FFmpeg `acrossfade` fade curve (default `"qsin"`, equal-power).
  - `warmup`: the number of seconds before the fade window when the transition stream is spawned
    to warm up its buffers (default `5` seconds).
- `Queue#crossfade` property (`0` to `12` seconds) to configure or toggle crossfade per queue at runtime.
- `Queue#scheduleCrossfade()` to re-arm the crossfade transition immediately if `Queue#crossfade` is modified mid-song.
- `CrossfadeOptions` and `CrossfadeStreamOptions` exported types.

### Fixed

- Resolved file URLs with Windows drive letters (`file:///C:/...`) and UNC network shares properly
  when decoding local audio files with FFmpeg.

## [6.1.0]

This version adds the events that the playback and the queue were missing. A bot can now react to
what happens to a song without polling the queue: the events are emitted after the change, with the
queue and the data of the change.

A queue can also prepare its next song in advance. When the preloading is enabled, DisTube resolves
the stream of the next song and creates its stream before the current song ends, so the transition
between two songs does not wait for the resolution any more.

### Added

- The playback events: `pauseSong`, `resumeSong`, `seekSong`, `setVolume`, `skipSong` and
  `shuffleQueue`. They carry the queue and the data of the change: the paused or resumed song, the
  seek position, the new and the old volumes, the skipped song or the shuffled songs.
- The `changeFilter` event, with the new and the old filters. It is emitted only when the filters
  actually change.
- The `voiceChannelChange` event, emitted when the bot is moved to another voice channel, with the
  old and the new channels.
- The `preload` option prepares the next song of a queue in advance. It accepts a boolean, or an
  object with an `enabled` field and a `threshold` field: the number of seconds remaining in the
  current song before the preparation starts, 15 by default. The default is disabled.
- The preload events: `preloadSong` when the preparation starts, `preloadedSong` when the next song
  is ready, and `preloadError` when it fails. A failed preload never interrupts the playback: the
  song is resolved again when it starts.

## [6.0.2]

The documentation of the library, of the wiki and of the website no longer names the services or the
plugins of the upstream repository. This fork does not maintain them, so the examples use a plugin
of their own, and the pages that were about one service now say what a plugin needs.

The plugin API did not change.

## [6.0.1]

The first version that the workflow of the fork publishes. The library did not change: it is the
code of 6.0.0, built by the pipeline and signed with a provenance attestation.

## [6.0.0]

The plugin API got a new shape, and the API that was deprecated in v5.2 is gone.

### Added

- `Plugin#source` and `Plugin#aliases` declare the identifiers of a source. `DisTube#getPlugin()`
  finds a plugin with one of them, and the identifiers default to the name of the class.
- `DisTube#search()` searches the plugins and returns a `SearchResult`. The `source` option of
  `SearchOptions` and `PlayOptions` routes a query to a single source.
- `ExtractorPlugin#search()` returns the songs of a source. The default implementation delegates to
  `searchSong()`, so the existing plugins keep working unchanged.
- `SearchResult` is the result of a search, at every level: it carries the songs, the optional
  playlist, the query type and the sources that contributed to it.
- `Plugin#destroy()` releases the resources of a plugin. `DisTube#destroy()` calls it, and it also
  closes the stream server.
- `StreamServer` is the local HTTP server of DisTube. A plugin that cannot hand out a static URL to
  FFmpeg registers a handler on it instead of running its own server: one server for the whole bot,
  on an ephemeral port, with a random prefix in the URLs.
- `PluginError` and `PluginErrorCode` are the errors a plugin raises: an unsupported URL, a missing
  song, a missing stream, an unavailable source and an age-restricted content.
- `DisTubeError.withMessage()` creates an error with a custom message and a `cause`.
- `DisTube.create()` waits for the plugins to be initialized.
- `SongInfo#metadata` attaches source specific data to a song.
- `Queue#isActive` tells whether the queue is still active.

### Changed

- The three plugin types are merged into `ExtractorPlugin`. `InfoExtractorPlugin` and
  `PlayableExtractorPlugin` extend it and only change their `type`.
- `Plugin#playable` declares that a plugin cannot play the songs it resolves. The `Song` constructor
  then forces `playFromSource` to `false`, and DisTube looks for a playable version of the song with
  the other plugins.
- The proxy of a song that cannot be played tries **every** searchable plugin, in the order they
  were registered, instead of only the first one.
- `DisTubeError.withMessage()` is polymorphic: calling it on a subclass creates an instance of that
  subclass.
- The init of a plugin can be asynchronous. A failure is reported as a warning instead of crashing
  the process.
- `@discordjs/voice` is pinned to `^0.19.0`, and DAVE encryption is enabled explicitly.

### Fixed

- Emitting the `error` event without a listener does not crash the process any more.
- A track that does not produce any audio is detected and skipped, instead of playing silence
  forever.
- Applying an audio filter does not remove the current song from the queue when the restart of the
  stream fails.
- `Queue#previous()` does not queue the song twice in the repeat-queue mode.
- The error of a failed search is not lost any more: it is kept as the `cause` of the error.
- The `empty` event is emitted when the queue runs out of songs. It was declared but never emitted.
- The metadata of a song is not wiped by the metadata of its playlist.
- The intents of the client are checked without `instanceof`, so a project with more than one copy of
  discord.js in its tree works.

### Removed

- The 12 shortcut methods of `DisTube`: `pause`, `resume`, `stop`, `setVolume`, `skip`, `previous`,
  `shuffle`, `jump`, `setRepeatMode`, `toggleAutoplay`, `addRelatedSong` and `seek`. Use the queue
  methods instead: `distube.getQueue(guild).pause()`.
- `Queue#isPlaying()`, `Queue#isPaused()` and `Queue#playing`. Use the `paused` property and the
  `isActive` getter.
- The `InfoExtratorPlugin` and `PlayableExtratorPlugin` aliases, which had a typo in their name.

[6.1.0]: https://github.com/carlylekatto/DisTube/releases/tag/6.1.0
[6.0.2]: https://github.com/carlylekatto/DisTube/releases/tag/6.0.2
[6.0.1]: https://github.com/carlylekatto/DisTube/releases/tag/6.0.1
[6.0.0]: https://github.com/carlylekatto/DisTube/releases/tag/6.0.0
