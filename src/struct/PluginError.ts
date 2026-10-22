import { DisTubeError } from "./DisTubeError";

/**
 * The error codes a plugin can raise.
 */
export enum PluginErrorCode {
  /**
   * The URL is not supported by the plugin.
   */
  UNSUPPORTED_URL = "UNSUPPORTED_URL",
  /**
   * The song, the playlist or the album was not found.
   */
  NOT_FOUND = "NOT_FOUND",
  /**
   * The plugin could not get a playable stream for the song.
   */
  NO_STREAM = "NO_STREAM",
  /**
   * The source is temporarily unavailable: rate limit, server error or network
   * failure.
   */
  SOURCE_UNAVAILABLE = "SOURCE_UNAVAILABLE",
  /**
   * The content is age-restricted.
   */
  AGE_RESTRICTED = "AGE_RESTRICTED",
}

const DEFAULT_MESSAGES: Record<PluginErrorCode, string> = {
  [PluginErrorCode.UNSUPPORTED_URL]: "This URL is not supported by the plugin",
  [PluginErrorCode.NOT_FOUND]: "The song was not found",
  [PluginErrorCode.NO_STREAM]: "No playable stream was found for the song",
  [PluginErrorCode.SOURCE_UNAVAILABLE]: "The source is temporarily unavailable",
  [PluginErrorCode.AGE_RESTRICTED]: "The content is age-restricted",
};

/**
 * The error raised by a plugin.
 *
 * It extends {@link DisTubeError}, so the code of the error is available with
 * `error.errorCode` and the error can be caught with `instanceof DisTubeError`.
 */
export class PluginError<T extends PluginErrorCode = PluginErrorCode> extends DisTubeError<T> {
  /**
   * Create a plugin error.
   * @param code    - The error code
   * @param message - The message. It defaults to the one of the error code.
   * @param options - Optional options
   * @param options.cause - The original error that caused this one
   * @example
   * ```ts
   * throw new PluginError(PluginErrorCode.NOT_FOUND);
   * ```
   */
  constructor(code: T, message?: string, options?: { cause?: unknown }) {
    super(code, message ?? DEFAULT_MESSAGES[code]);
    if (options && "cause" in options) this.cause = options.cause;
  }
  /**
   * The name of the error, with its code.
   * @returns The name of the error, e.g. `PluginError [NOT_FOUND]`
   */
  override get name() {
    return `PluginError [${this.errorCode}]`;
  }
}
