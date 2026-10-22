<div align="center">
  <p>
    <a href="https://github.com/carlylekatto/DisTube/actions" target="_blank"><img alt="GitHub Workflow Status" src="https://img.shields.io/github/actions/workflow/status/carlylekatto/DisTube/test.yml?branch=main&label=Tests&logo=github&style=flat-square" /></a>
    <a href="https://nodejs.org/" target="_blank"><img alt="node-current" src="https://img.shields.io/node/v/distube?logo=node.js&logoColor=white&style=flat-square"/></a>
    <a href="https://discord.js.org/" target="_blank"><img alt="npm peer dependency version" src="https://img.shields.io/npm/dependency-version/distube/peer/discord.js?label=discord.js&logo=discord&logoColor=white&style=flat-square"/></a>
    <br/>
    <a href="https://github.com/carlylekatto/DisTube/stargazers" target="_blank"><img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/carlylekatto/DisTube?logo=github&logoColor=white&style=flat-square"/></a>
    <a href="https://discord.gg/feaDd9h" target="_blank"><img alt="Discord" src="https://img.shields.io/discord/732254550689316914?logo=discord&logoColor=white&style=flat-square"/></a>
  </p>
</div>

# DisTube

DisTube plays music in a Discord bot. It handles the voice connection, the queue, the audio filters
and the sources, so a bot only has to deal with its own commands.

## This fork

This repository is a fork of [skick1234/DisTube](https://github.com/skick1234/DisTube). The v6 line
is built here, and the two lines part ways from here: the plugin API, the stream server and the
errors of the plugins belong to this fork.

Fixes that every user needs are still sent upstream as pull requests, so both lines get them. There
is one so far, [#353](https://github.com/skick1234/DisTube/pull/353), which turns on the DAVE
encryption that Discord made mandatory in March 2026.
- [The documentation of the fork](https://carlylekatto.github.io/distube-website/)
- [The changelog](./CHANGELOG.md)
- [Publishing the fork](./PUBLISHING.md)

## Requirements

- Node.js 22.12 or later, or Bun
- FFmpeg on the PATH
- discord.js 14
- @discordjs/voice 0.19.1 or later

## Install

```bash
npm install @kattowo/distube @discordjs/voice @discordjs/opus
```

```bash
# Bun works as well
bun add @kattowo/distube @discordjs/voice @discordjs/opus
```

## Quick start

```javascript
const { DisTube } = require("@kattowo/distube");
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const distube = new DisTube(client);

distube.on("playSong", (queue, song) =>
  queue.textChannel.send(`Playing \`${song.name}\` - \`${song.formattedDuration}\``),
);

client.on("messageCreate", message => {
  if (message.content.startsWith("!play")) {
    distube.play(message.member.voice.channel, message.content.slice(6), {
      message,
      textChannel: message.channel,
      member: message.member,
    });
  }
});

client.login("TOKEN");
```

The shortcut methods are gone in v6. `distube.pause(guild)` becomes `distube.getQueue(guild).pause()`.
The changelog lists every removal.

## The plugins

DisTube ships no music source. Every source is a plugin, so a bot loads the ones it needs:

```javascript
const { DisTube } = require("@kattowo/distube");
const { MyPlugin } = require("./my-plugin.js");

const distube = new DisTube(client, {
  plugins: [new MyPlugin()],
});
```

This fork does not maintain the plugins of the upstream repository. They may not work with it, and
they are not covered by the tests of this fork. Write your own extractor, or use a plugin that you
trust and that you can keep up to date.

A plugin that cannot hand out a static URL to FFmpeg registers a handler on the shared stream server
of DisTube, so the bot runs one HTTP server instead of one per plugin.

`search()` returns a `SearchResult` at every level, and the `source` option of the search and of the
play options routes a query to a single source:

```javascript
const result = await distube.search("never gonna give you up", { source: "my-source" });
```

## Documentation

- [Overview](https://carlylekatto.github.io/distube-website/)
- [Installation](https://carlylekatto.github.io/distube-website/getting-started/installation/)
- [Quick start](https://carlylekatto.github.io/distube-website/getting-started/quick-start/)
- [Plugin system](https://carlylekatto.github.io/distube-website/guide/plugins/)
- [Events](https://carlylekatto.github.io/distube-website/guide/events/)
- [Audio filters](https://carlylekatto.github.io/distube-website/guide/filters/)
- [Upgrading from v5](https://carlylekatto.github.io/distube-website/guide/upgrade/)
- [API reference](https://carlylekatto.github.io/distube-website/api/)
- [FAQ](https://carlylekatto.github.io/distube-website/faq/)

The wiki of the repository holds the long form pages.

## Contributing

Read the [contributing guidelines](./.github/CONTRIBUTING.md) first. A pull request that fixes
something should come with a test.

## License

[MIT](./LICENSE)
