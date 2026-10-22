# Frequently Asked Questions

## DisTube

### 1. FFMPEG_NOT_INSTALLED

#### Reason

- FFmpeg is not installed

#### Solution

- Install FFmpeg on: [Windows](http://blog.gregzaal.com/how-to-install-ffmpeg-on-windows/) - [Linux (Ubuntu, Mint,...)](https://www.tecmint.com/install-ffmpeg-in-linux/)
  > Download FFmpeg from [this repo](https://github.com/BtbN/FFmpeg-Builds/releases) if the download links are not available
- If you want to run FFmpeg from a custom path, or `ffmpeg-static`.path, e.t.c., you can use [`ffmpeg.path`](https://distube.js.org/types/DisTubeOptions.html) option.

### 2.1 The song ends instantly without any errors<br/>2.2 Error: write EPIPE

#### Reason

- This is due to FFmpeg error.

#### Solution:

- Check the FFmpeg log to check why it happens with [`ffmpegDebug`](https://distube.js.org/classes/DisTube.html#ffmpegdebug) event

```ts
import { Events } from "distube";
distube.on(Events.FFMPEG_DEBUG, console.log);
```

### 3.1 Error: Cannot find module '@discordjs/opus'<br/>3.2 RangeError: Source is too large<br/>3.3 RangeError: offset is out of bounds

#### Reason

- `@discordjs/opus` package is not installed, or you installed `node-opus` or `opusscript` package (which is not stable)

#### Solution

- Install `@discordjs/opus` package. Uninstall `node-opus`, `opusscript` if installed

```bash
# Using bun
bun remove opusscript node-opus
bun add @discordjs/opus

# Using npm
npm uninstall opusscript node-opus
npm install @discordjs/opus
```

### 4. Error: VOICE_CONNECTION_TIMEOUT

#### Reason

- It is due to your hosting/VPS network connection

#### Solution

1. Try to join the voice channel with `<DisTube>.voices.join(voiceChannel)` before using `DisTube.play()`.\
   You can retry if this function throws the above error.

2. Use a better network service (like the above VPS)

### 5.1 My bot plays a random song after finishing all the queue<br/>5.2 How to turn off autoplay<br/>5.3 How to change queue's default properties

#### Reason

- Autoplay is on by default.

#### Solution

- To turn it on/off by a command, use [queue.toggleAutoplay()](https://distube.js.org/classes/Queue.html#toggleautoplay).
- To change the queue's default setting, use [initQueue](https://distube.js.org/classes/DisTube.html#initqueue) event.

```javascript
import { Events } from "distube";

distube.on(Events.INIT_QUEUE, queue => {
  queue.autoplay = false;
  queue.setVolume(50);
});
```

## YouTubePlugin

### 1. Error: Status code: 429

#### Reason

- It is caused by requesting YouTube videos too fast.

#### Solution

- Use `cookies` option (Guide: [[YouTube-Cookies]]).
  > You have to sign in before getting the cookie.
  > You may have to wait for YouTube to unblock your IP after getting this error.
### 2.1 Sign in to confirm you're not a bot<br/>2.2 Get the best YouTube experience

#### Reason

- You are literally a Discord bot

#### Solution

- Use `cookies` option (Guide: [[YouTube-Cookies]]).
  > You have to sign in before getting the cookie.
### 3. Sign in to confirm your age

#### Reason

- Playing YouTube age-restricted videos

#### Solution

- Use `cookies` option (Guide: [[YouTube-Cookies]]).
  > You have to sign in before getting the cookie.
  > Your account information must be at least 18 years old.
### 4. Error checking for updates: Status code 403

#### Reason

- You are requested to github too many times (maybe due to restarting your bot). YouTubePlugin deps check their versions with github api so it can be rate-limited

#### Solution

- Disable check for updates temporarily with their env variables

```ts
process.env.YTSR_NO_UPDATE = "1";
process.env.YTDL_NO_UPDATE = "1";
```

## Common Issues

### How do I use slash commands with DisTube?

DisTube works with any command handler. For slash commands:

```javascript
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "play") {
    const query = interaction.options.getString("query", true);
    const voiceChannel = interaction.member?.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply("You must be in a voice channel!");
    }

    await interaction.deferReply();

    try {
      await distube.play(voiceChannel, query, {
        textChannel: interaction.channel,
        member: interaction.member,
      });
      await interaction.editReply(`Searching for: ${query}`);
    } catch (error) {
      await interaction.editReply(`Error: ${error.message}`);
    }
  }
});
```

### Why are shortcut methods deprecated?

The shortcut methods like `distube.pause(guild)`, `distube.skip(guild)`, etc. were deprecated in v5.2 and **removed in v6.0**. Use the queue methods directly:

```javascript
// ❌ Removed in v6.0
distube.pause(message.guildId);
distube.skip(message.guildId);

// ✅ Use the queue
const queue = distube.getQueue(message.guildId);
queue.pause();
queue.skip();
```

This change provides:
- Better type safety
- More explicit code
- Easier error handling
- Better IDE autocompletion

### Why is queue.paused true when the queue is stopped?

The `queue.paused` property stays `true` once the queue is stopped, so that `!queue.paused` stays `false` as soon as the queue is not playing anymore.

```javascript
// ✅ Check if audio is currently playing
if (!queue.paused) { ... }

// ✅ Check if paused or stopped
if (queue.paused) { ... }

// ✅ Check if stopped
if (queue.stopped) { ... }

// ✅ Check if the queue is still active (it is also true when it is paused)
if (queue.isActive) { ... }
```

## Hosting

A bot that plays music needs a host that can reach the voice servers. See [[Hosting]].
