# Plugins and bots

## Where the plugins come from

DisTube ships no music source. Every service is a plugin, and the plugins live outside the library.

> [!CAUTION]
> This fork does not maintain the plugins of the upstream repository. They may not work with it, and
> they are not covered by the tests of this fork. Write your own extractor, or use a plugin that you
> trust and that you can keep up to date.

## The three kinds of plugin

### ExtractorPlugin

> This plugin can extract the info, search, and play songs directly from its source.

### InfoExtractorPlugin

> This plugin only can extract the info from supported links, but not play songs directly from its source.

### PlayableExtractorPlugin

> This plugin can extract and play songs from supported links, but cannot search for songs from its source.

A plugin that only knows the metadata declares `playable: false`, and DisTube looks for a playable
version of the song with the other plugins. See [[Plugin-System]] to write one.

## Finding a plugin

A plugin publishes the identifiers of its source, so you can find it back in the registry of the
plugins:

```js
distube.getPlugin("my-source");
```

Look for a plugin in the place where you publish your own work: the registry of your package
manager, and the topics of the community. The [DisTube Discord server](https://discord.gg/feaDd9h) is
the other place to ask.

> [!CAUTION]
> The order of the plugins matters. A plugin that accepts almost every URL has to be the last one, or
> it shadows the others.

# Bots

- [DisTube Example](https://github.com/distubejs/example) - Example bot with simple command handler.
- [AICoTest](https://github.com/AlexInCube/AlCoTest) - Advanced audiobot.

> [!NOTE]
> To add your bot to this list, please [create a pull request](https://github.com/carlylekatto/DisTube/pulls) with the edited [`wiki/Projects-Hub.md`](https://github.com/carlylekatto/DisTube/blob/main/wiki/Projects-Hub.md) file.
