# Audio Effects & Filters

DisTube ships with a set of ready-to-use FFmpeg audio filters. They are managed per queue with the
[`FilterManager`](https://carlylekatto.github.io/distube-website/api/classes/filtermanager/), reachable through `queue.filters`.

> [!NOTE]
> The FFmpeg audio filters are applied when the stream is created. Changing the filters restarts the
> current stream at the same playback position, so there is a short interruption.

## Built-in filters

| Name        | FFmpeg argument                                 | Description                            |
| ----------- | ----------------------------------------------- | -------------------------------------- |
| `3d`        | `apulsator=hz=0.125`                            | Spacial effect for headphones          |
| `bassboost` | `bass=g=10`                                     | Boosts the bass                        |
| `echo`      | `aecho=0.8:0.9:1000:0.3`                        | Adds an echo                           |
| `flanger`   | `flanger`                                       | Flanger effect                         |
| `gate`      | `agate`                                         | Removes the silence between the tracks |
| `haas`      | `haas`                                          | Stereo widening                        |
| `karaoke`   | `stereotools=mlev=0.1`                          | Removes the vocals                     |
| `nightcore` | `asetrate=48000*1.25,aresample=48000,bass=g=5`  | Faster and deeper                      |
| `reverse`   | `areverse`                                      | Plays the track backwards              |
| `vaporwave` | `asetrate=48000*0.8,aresample=48000,atempo=1.1` | Slowed down and deeper                 |
| `mcompand`  | `mcompand`                                      | Multi band compressor                  |
| `phaser`    | `aphaser`                                       | Phaser effect                          |
| `tremolo`   | `tremolo`                                       | Varying the volume                     |
| `surround`  | `surround`                                      | Surround effect                        |
| `earwax`    | `earwax`                                        | Enhances the vocals like earphones     |

## Using the filters

```javascript
const queue = distube.getQueue(guildId);

// Enable one or more filters
queue.filters.add("bassboost");
queue.filters.add(["nightcore", "vaporwave"]);

// Disable one or more filters
queue.filters.remove("bassboost");

// Replace every enabled filter
queue.filters.set(["karaoke"]);

// Remove every filter
queue.filters.clear();

// Check whether a filter is enabled
queue.filters.has("bassboost"); // true

// The enabled filters
queue.filters.names; // ["nightcore", "vaporwave"]
queue.filters.values; // [{ name: "nightcore", value: "..." }, ...]
```

## Custom filters

A custom filter is a name and its FFmpeg audio filter argument:

```javascript
const { Filter } = require("@kattowo/distube");

queue.filters.add({
  name: "my-filter",
  value: "equalizer=f=1000:width_type=w:width=50:g=-6",
});
```

You can also override or extend the built-in filters globally with the
[`customFilters`](https://carlylekatto.github.io/distube-website/api/classes/options/#customfilters) option:

```javascript
const distube = new DisTube(client, {
  customFilters: {
    // Override a built-in filter
    nightcore: "asetrate=48000*1.5,aresample=48000,bass=g=8",
    // Or add a new one
    "my-filter": "equalizer=f=1000:width_type=w:width=50:g=-6",
  },
});
```

> [!TIP]
> `queue.filters.ffmpegArgs` returns the FFmpeg argument that is actually applied to the stream
> (`{ af: "..." }`). It is useful to debug what is really being sent to FFmpeg.
