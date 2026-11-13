import { URL } from "node:url";
import type {
  Client,
  ClientOptions,
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  Message,
  Snowflake,
  VoiceBasedChannel,
  VoiceState,
} from "discord.js";
import { Constants, GatewayIntentBits, IntentsBitField, SnowflakeUtil } from "discord.js";
import { DisTubeVoice } from "./core/DisTubeVoice";
import { DisTubeError } from "./struct/DisTubeError";
import { Queue } from "./struct/Queue";
import type { GuildIdResolvable, UnhandledErrorBehavior } from "./type";

const formatInt = (int: number) => (int < 10 ? `0${int}` : int);

/**
 * Format duration to string
 * @param sec - Duration in seconds
 * @returns The formatted duration, e.g. `01:23` or `01:02:03`
 */
export function formatDuration(sec: number): string {
  if (!sec || !Number(sec)) return "00:00";
  const seconds = Math.floor(sec % 60);
  const minutes = Math.floor((sec % 3600) / 60);
  const hours = Math.floor(sec / 3600);
  if (hours > 0) return `${formatInt(hours)}:${formatInt(minutes)}:${formatInt(seconds)}`;
  if (minutes > 0) return `${formatInt(minutes)}:${formatInt(seconds)}`;
  return `00:${formatInt(seconds)}`;
}
const SUPPORTED_PROTOCOL = ["https:", "http:", "file:"] as const;
/**
 * Check if the string is an URL
 * @param input - input
 * @returns `true` when the input is an URL with a supported protocol
 */
export function isURL(input: any): input is `${(typeof SUPPORTED_PROTOCOL)[number]}//${string}` {
  if (typeof input !== "string" || input.includes(" ")) return false;
  try {
    const url = new URL(input);
    if (!SUPPORTED_PROTOCOL.some(p => p === url.protocol)) return false;
  } catch {
    return false;
  }
  return true;
}
/**
 * Check if the Client has enough intents to using DisTube
 * @param options - options
 * @returns Nothing
 * @throws {@link DisTubeError} When the `GuildVoiceStates` intent is missing
 */
export function checkIntents(options: ClientOptions): void {
  // The `instanceof` check is not used on purpose: a project can have more than
  // one copy of discord.js in its tree (a linked package, a monorepo, ...), and
  // the intents of the client would not be an instance of our own IntentsBitField.
  const intents = options.intents as unknown as { has?: (bit: number | bigint) => boolean };
  const hasVoiceStates =
    typeof intents?.has === "function"
      ? intents.has(GatewayIntentBits.GuildVoiceStates)
      : new IntentsBitField(options.intents as never).has(GatewayIntentBits.GuildVoiceStates);
  if (!hasVoiceStates) throw new DisTubeError("MISSING_INTENTS", "GuildVoiceStates");
}

/**
 * Check if the voice channel is empty
 * @param voiceState - voiceState
 * @returns `true` when there is no human user in the voice channel of the state
 */
export function isVoiceChannelEmpty(voiceState: VoiceState): boolean {
  const guild = voiceState.guild;
  const clientId = voiceState.client.user?.id;
  if (!guild || !clientId) return false;
  const voiceChannel = guild.members.me?.voice?.channel;
  if (!voiceChannel) return false;
  const members = voiceChannel.members.filter(m => !m.user.bot);
  return !members.size;
}

/**
 * Check if the value is a valid Discord snowflake.
 * @param id - The value to check
 * @returns `true` when the value is a valid snowflake
 */
export function isSnowflake(id: any): id is Snowflake {
  try {
    return SnowflakeUtil.deconstruct(id).timestamp > SnowflakeUtil.epoch;
  } catch {
    return false;
  }
}

/**
 * Check if the value is a Discord.js guild member.
 * @param member - The value to check
 * @returns `true` when the value looks like a guild member
 */
export function isMemberInstance(member: any): member is GuildMember {
  return (
    Boolean(member) &&
    isSnowflake(member.id) &&
    isSnowflake(member.guild?.id) &&
    isSnowflake(member.user?.id) &&
    member.id === member.user.id
  );
}

/**
 * Check if the value is a Discord.js guild text based channel.
 * @param channel - The value to check
 * @returns `true` when the value looks like a guild text based channel
 */
export function isTextChannelInstance(channel: any): channel is GuildTextBasedChannel {
  return (
    Boolean(channel) &&
    isSnowflake(channel.id) &&
    isSnowflake(channel.guildId || channel.guild?.id) &&
    Constants.TextBasedChannelTypes.includes(channel.type) &&
    typeof channel.send === "function" &&
    (typeof channel.nsfw === "boolean" || typeof channel.parent?.nsfw === "boolean")
  );
}

/**
 * Check if the value is a Discord.js message.
 * @param message - The value to check
 * @returns `true` when the value looks like a message
 */
export function isMessageInstance(message: any): message is Message<true> {
  // Simple check for using distube normally
  return (
    Boolean(message) &&
    isSnowflake(message.id) &&
    isSnowflake(message.guildId || message.guild?.id) &&
    isMemberInstance(message.member) &&
    isTextChannelInstance(message.channel) &&
    Constants.NonSystemMessageTypes.includes(message.type) &&
    message.member.id === message.author?.id
  );
}

/**
 * Check if the value is a Discord.js voice based channel.
 * @param channel - The value to check
 * @returns `true` when the value looks like a voice based channel
 */
export function isSupportedVoiceChannel(channel: any): channel is VoiceBasedChannel {
  return (
    Boolean(channel) &&
    isSnowflake(channel.id) &&
    isSnowflake(channel.guildId || channel.guild?.id) &&
    Constants.VoiceBasedChannelTypes.includes(channel.type)
  );
}

/**
 * Check if the value is a Discord.js guild.
 * @param guild - The value to check
 * @returns `true` when the value looks like a guild
 */
export function isGuildInstance(guild: any): guild is Guild {
  return Boolean(guild) && isSnowflake(guild.id) && isSnowflake(guild.ownerId) && typeof guild.name === "string";
}

/**
 * Resolve a guild id from anything that can be resolved to a guild id.
 * @param resolvable - The value to resolve
 * @returns The id of the guild
 * @throws {@link DisTubeError} When the value cannot be resolved to a guild id
 */
export function resolveGuildId(resolvable: GuildIdResolvable): Snowflake {
  let guildId: string | undefined;
  if (typeof resolvable === "string") {
    guildId = resolvable;
  } else if (isObject(resolvable)) {
    if ("guildId" in resolvable && resolvable.guildId) {
      guildId = resolvable.guildId;
    } else if (resolvable instanceof Queue || resolvable instanceof DisTubeVoice || isGuildInstance(resolvable)) {
      guildId = resolvable.id;
    } else if ("guild" in resolvable && isGuildInstance(resolvable.guild)) {
      guildId = resolvable.guild.id;
    }
  }
  if (!isSnowflake(guildId)) throw new DisTubeError("INVALID_TYPE", "GuildIdResolvable", resolvable);
  return guildId;
}

/**
 * Check if the value is a Discord.js client.
 * @param client - The value to check
 * @returns `true` when the value looks like a client
 */
export function isClientInstance(client: any): client is Client {
  return Boolean(client) && typeof client.login === "function";
}

/**
 * Check that an object does not have any key that is not in a source.
 * @param target     - The object to check
 * @param source     - The valid keys, or the object that holds them
 * @param sourceName - The name of the source, used in the error message
 * @returns Nothing
 * @throws {@link DisTubeError} When the target is not an object, or when it has
 * an invalid key
 */
export function checkInvalidKey(
  target: Record<string, any>,
  source: Record<string, any> | string[],
  sourceName: string,
) {
  if (!isObject(target)) throw new DisTubeError("INVALID_TYPE", "object", target, sourceName);
  const sourceKeys = Array.isArray(source) ? source : objectKeys(source);
  const invalidKey = objectKeys(target).find(key => !sourceKeys.includes(key));
  if (invalidKey) throw new DisTubeError("INVALID_KEY", sourceName, invalidKey);
}

/**
 * Check if the value is a plain object.
 * @param obj - The value to check
 * @returns `true` when the value is an object and not an array nor `null`
 */
export function isObject(obj: any): obj is object {
  return typeof obj === "object" && obj !== null && !Array.isArray(obj);
}

/**
 * The keys of a type, as an array.
 */
export type KeyOf<T> = T extends object ? (keyof T)[] : [];
/**
 * Get the keys of an object.
 * @param obj - The object
 * @returns The keys of the object, or an empty array when it is not an object
 */
export function objectKeys<T>(obj: T): KeyOf<T> {
  if (!isObject(obj)) return [] as KeyOf<T>;
  return Object.keys(obj) as KeyOf<T>;
}

/**
 * Check if the channel is age-restricted.
 * @param channel - The channel to check
 * @returns `true` when the channel is a NSFW channel
 */
export function isNsfwChannel(channel?: GuildTextBasedChannel): boolean {
  if (!isTextChannelInstance(channel)) return false;
  if (channel.isThread()) return channel.parent?.nsfw ?? false;
  return channel.nsfw;
}

/**
 * The falsy values of JavaScript.
 */
export type Falsy = undefined | null | false | 0 | "";
/**
 * Check if a value is not falsy.
 * @param x - The value to check
 * @returns `true` when the value is not falsy
 */
export const isTruthy = <T>(x: T | Falsy): x is T => Boolean(x);

/**
 * Handle an error that was emitted through the special `"error"` event without
 * any listener.
 *
 * Node.js throws an `ERR_UNHANDLED_ERROR` in that situation, which crashes the
 * whole process. DisTube handles it gracefully instead.
 * @param error    - The error
 * @param behavior - The behavior to apply. Defaults to `"log"`.
 * @returns Nothing
 * @throws The given error when the behavior is `"throw"`
 */
export function handleUnhandledError(error: Error, behavior: UnhandledErrorBehavior = "log"): void {
  if (behavior === "throw") throw error;
  if (behavior === "ignore") return;
  process.emitWarning(
    "The 'error' event was emitted but there is no listener for it. " +
      "Add a listener with `distube.on(Events.ERROR, (error, queue, song) => { ... })` " +
      "to handle DisTube errors, or set `unhandledError` to 'throw' to restore the default behavior.",
    {
      code: "DIS_TUBE_UNHANDLED_ERROR",
      detail: error?.stack ?? error?.message ?? String(error),
    },
  );
}

/**
 * Check that an encryption library is available.
 *
 * Discord encrypts the audio with DAVE, so a cipher is required to play it.
 * The `aes-256-gcm` cipher of Node.js is used when it is available, otherwise
 * one of the supported third-party libraries is used.
 * @returns `true` when an encryption library is available
 */
export const checkEncryptionLibraries = async () => {
  if (await import("node:crypto").then(m => m.getCiphers().includes("aes-256-gcm"))) return true;
  for (const lib of [
    "@noble/ciphers",
    "@stablelib/xchacha20poly1305",
    "sodium-native",
    "sodium",
    "libsodium-wrappers",
    "tweetnacl",
  ]) {
    try {
      await import(lib);
      return true;
    } catch {}
  }
  return false;
};

const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([408, 500, 502, 503, 504]);
const CONNECTION_CODES: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_SOCKET",
  "ETIMEDOUT",
]);
const MAX_WAITS_MS = [250, 1000];
const CANCELLED_NAMES = new Set(["TimeoutError", "AbortError"]);

export interface RetryRequestOptions {
  /** Optional AbortSignal to cancel retry attempts */
  readonly signal?: AbortSignal;
  /** Max retry attempts (default: 3) */
  readonly attempts?: number;
  /** Custom check for whether an error is transient */
  readonly transient?: (error: unknown) => boolean;
  /** Optional callback fired on each retry */
  readonly onRetry?: (attempt: number, reason: string) => void;
}

function* errorChain(value: unknown): Generator<object> {
  const seen = new Set<unknown>();
  for (let link = value; typeof link === "object" && link !== null && !seen.has(link); ) {
    seen.add(link);
    yield link;
    link = "cause" in link ? (link as any).cause : undefined;
  }
}

function statusOf(value: unknown): number | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  if ("status" in value && typeof (value as any).status === "number") return (value as any).status;
  if ("statusCode" in value && typeof (value as any).statusCode === "number") return (value as any).statusCode;
  return undefined;
}

function codeOf(value: object): string | undefined {
  return "code" in value && typeof (value as any).code === "string" ? (value as any).code : undefined;
}

function isCancelled(error: unknown): boolean {
  return [...errorChain(error)].some(
    link => "name" in link && typeof (link as any).name === "string" && CANCELLED_NAMES.has((link as any).name),
  );
}

function isFailedRequest(value: unknown): boolean {
  const status = statusOf(value);
  if (status !== undefined) return TRANSIENT_STATUSES.has(status);
  return [...errorChain(value)].some(link => CONNECTION_CODES.has(codeOf(link) ?? ""));
}

/**
 * Check whether an error or response indicates a transient network or HTTP failure.
 * @param value - The error or response to check
 * @returns `true` when the failure is transient
 */
export function isTransientFailure(value: unknown): boolean {
  if (DisTubeError.is(value)) return value.transient === true;
  return !isCancelled(value) && isFailedRequest(value);
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    let timer: NodeJS.Timeout;
    const abort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/**
 * Calls `send` up to `attempts` (default: 3) times, retrying upon encountering a transient
 * status code (500, 502, 503, 504, 408) or a network connection drop (ECONNRESET, ETIMEDOUT, etc.).
 *
 * @param send    - The asynchronous function to execute
 * @param options - Retry options
 * @returns The resolved result of `send()`
 */
export async function retryRequest<T>(send: () => Promise<T>, options: RetryRequestOptions = {}): Promise<T> {
  const { signal, attempts = 3, transient = isTransientFailure, onRetry } = options;
  for (let attempt = 1; ; attempt++) {
    signal?.throwIfAborted?.();
    const isLast = attempt >= attempts;
    let failure: { status?: number; error?: string } | undefined;
    try {
      const answer = await send();
      const status = statusOf(answer);
      if (isLast || signal?.aborted || status === undefined || !TRANSIENT_STATUSES.has(status)) return answer;
      if (
        typeof answer === "object" &&
        answer !== null &&
        "body" in answer &&
        typeof (answer as any).body?.cancel === "function"
      ) {
        (answer as any).body.cancel().catch(() => undefined);
      }
      failure = { status };
    } catch (error: unknown) {
      if (isLast || signal?.aborted || isCancelled(error) || !transient(error)) throw error;
      const status = statusOf(error);
      failure = status === undefined ? { error: error instanceof Error ? error.name : String(error) } : { status };
    }
    const reason = failure.status !== undefined ? `HTTP ${failure.status}` : (failure.error ?? "unknown error");
    onRetry?.(attempt, reason);
    const maxWait = MAX_WAITS_MS[attempt - 1] ?? 1000;
    await pause(Math.random() * maxWait, signal);
  }
}
