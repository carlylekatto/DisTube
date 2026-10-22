import { getVoiceConnection, VoiceConnectionStatus } from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import type { GuildIdResolvable } from "../..";
import { DisTubeError, resolveGuildId } from "../..";
import { DisTubeVoice } from "../DisTubeVoice";
import { GuildIdManager } from "./GuildIdManager";

/**
 * Manages voice connections
 */
export class DisTubeVoiceManager extends GuildIdManager<DisTubeVoice> {
  /**
   * Create a {@link DisTubeVoice} instance
   * @param channel - A voice channel to join
   * @returns The voice connection of the guild
   * @throws {@link DisTubeError} When the guild already has a voice connection
   * that is not managed by DisTube
   */
  create(channel: VoiceBasedChannel): DisTubeVoice {
    const existing = this.get(channel.guildId);
    if (existing) {
      existing.channel = channel;
      return existing;
    }
    if (
      getVoiceConnection(resolveGuildId(channel), this.client.user?.id) ||
      getVoiceConnection(resolveGuildId(channel))
    ) {
      throw new DisTubeError("VOICE_ALREADY_CREATED");
    }
    return new DisTubeVoice(this, channel);
  }
  /**
   * Join a voice channel and wait until the connection is ready
   * @param channel - A voice channel to join
   * @returns The voice connection of the guild
   * @throws {@link DisTubeError} When the connection cannot be established
   */
  join(channel: VoiceBasedChannel): Promise<DisTubeVoice> {
    const existing = this.get(channel.guildId);
    if (existing) return existing.join(channel);
    return this.create(channel).join();
  }
  /**
   * Leave the connected voice channel in a guild
   * @param guild - Queue Resolvable
   * @returns Nothing
   */
  leave(guild: GuildIdResolvable) {
    const voice = this.get(guild);
    if (voice) {
      voice.leave();
    } else {
      const connection =
        getVoiceConnection(resolveGuildId(guild), this.client.user?.id) ?? getVoiceConnection(resolveGuildId(guild));
      if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
    }
  }
}
