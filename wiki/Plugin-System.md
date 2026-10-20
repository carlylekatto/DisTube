# Plugin System

DisTube does not include any music source by default. Every source is provided by a **plugin**, which
means you only install and load the sources you actually need.

## Plugin types

| Type | Base class | Can extract the info | Can search | Can play the track |
| --- | --- | --- | --- | --- |
| Extractor | `ExtractorPlugin` | ✅ | ✅ | ✅ |
| Info extractor | `InfoExtractorPlugin` | ✅ | ❌ | ❌ (delegates to an extractor) |
| Playable extractor | `PlayableExtractorPlugin` | ✅ | ❌ | ✅ |

## Using the official plugins

```javascript
const { DisTube } = require("distube");
const { YouTubePlugin } = require("@distube/youtube");
const { SpotifyPlugin } = require("@distube/spotify");

const distube = new DisTube(client, {
  plugins: [new YouTubePlugin(), new SpotifyPlugin()],
});
```

> [!IMPORTANT]
> The order of the plugins matters: the first plugin whose `validate()` method returns `true` for a
> given URL is the one used to resolve it.

See the [[Projects Hub]] for the full list of the official and unofficial plugins.

## Writing your own plugin

Every plugin extends one of the three base classes and implements its methods.

### ExtractorPlugin

Use it when your source can be searched **and** played:

```javascript
const { ExtractorPlugin, PluginType } = require("distube");

class MyPlugin extends ExtractorPlugin {
  // Check whether the URL is supported by this plugin
  async validate(url) {
    return url.startsWith("https://example.com/");
  }

  // Resolve the URL to a Song or a Playlist
  async resolve(url, options) {
    // Fetch the metadata and return a Song or a Playlist
  }

  // Search a track. Return null when there is no result.
  async searchSong(query, options) {
    // ...
  }

  // Get the playable stream URL of a Song
  async getStreamURL(song) {
    return song.url;
  }

  // Get the related songs (used by the autoplay)
  async getRelatedSongs(song) {
    return [];
  }
}
```

### InfoExtractorPlugin

Use it when your source only provides the metadata (for example Spotify). DisTube then looks for a
playable version of the track with an extractor plugin:

```javascript
const { InfoExtractorPlugin } = require("distube");

class MyInfoPlugin extends InfoExtractorPlugin {
  async validate(url) {
    return url.startsWith("https://example.com/track/");
  }

  async resolve(url, options) {
    // Return a Song with `playFromSource: false`
  }

  // Create the search query used to find a playable version of the track
  async createSearchQuery(song) {
    return `${song.name} ${song.uploader.name}`;
  }
}
```

### PlayableExtractorPlugin

Use it when your source can be played but not searched:

```javascript
const { PlayableExtractorPlugin } = require("distube");

class MyPlayablePlugin extends PlayableExtractorPlugin {
  async validate(url) {
    return url.startsWith("https://example.com/audio/");
  }

  async resolve(url, options) {
    // Return a Song
  }

  async getStreamURL(song) {
    return song.url;
  }
}
```

## Registering the plugin

```javascript
const distube = new DisTube(client, {
  plugins: [new MyPlugin()],
});
```

> [!NOTE]
> `getRelatedSongs()` is required by every plugin. Return an empty array when your source has no
> related songs, otherwise the autoplay will not work for your source.
