# Changelog

All the notable changes of DisTube are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[6.0.1]: https://github.com/carlylekatto/DisTube/releases/tag/6.0.1
[6.0.0]: https://github.com/carlylekatto/DisTube/releases/tag/6.0.0
