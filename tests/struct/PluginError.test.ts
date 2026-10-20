import { describe, expect, it } from "vitest";
import { DisTubeError, PluginError, PluginErrorCode } from "@";

describe("PluginError", () => {
  it("is a DisTubeError", () => {
    const error = new PluginError(PluginErrorCode.NOT_FOUND);

    expect(error).toBeInstanceOf(DisTubeError);
    expect(error).toBeInstanceOf(PluginError);
    expect(error).toBeInstanceOf(Error);
  });

  it("carries the code of the error", () => {
    const error = new PluginError(PluginErrorCode.NO_STREAM);

    expect(error.errorCode).toBe(PluginErrorCode.NO_STREAM);
    expect(error.code).toBe(PluginErrorCode.NO_STREAM);
  });

  it("has its own name", () => {
    const error = new PluginError(PluginErrorCode.UNSUPPORTED_URL);

    expect(error.name).toBe("PluginError [UNSUPPORTED_URL]");
  });

  it("uses the default message of the code", () => {
    const error = new PluginError(PluginErrorCode.SOURCE_UNAVAILABLE);

    expect(error.message).toBe("The source is temporarily unavailable");
  });

  it("uses a custom message", () => {
    const error = new PluginError(PluginErrorCode.NOT_FOUND, "Không tìm thấy bài hát trên Spotify");

    expect(error.message).toBe("Không tìm thấy bài hát trên Spotify");
    expect(error.errorCode).toBe(PluginErrorCode.NOT_FOUND);
  });

  it("keeps the cause", () => {
    const cause = new Error("network down");
    const error = new PluginError(PluginErrorCode.SOURCE_UNAVAILABLE, undefined, { cause });

    expect(error.cause).toBe(cause);
  });

  it("has a default message for every code", () => {
    for (const code of Object.values(PluginErrorCode)) {
      const error = new PluginError(code);
      expect(error.message.length).toBeGreaterThan(0);
    }
  });

  describe("withMessage()", () => {
    it("creates a PluginError with a custom message", () => {
      const error = PluginError.withMessage(PluginErrorCode.NOT_FOUND, "custom message");

      expect(error).toBeInstanceOf(PluginError);
      expect(error).toBeInstanceOf(DisTubeError);
      expect(error.message).toBe("custom message");
      expect(error.errorCode).toBe(PluginErrorCode.NOT_FOUND);
    });

    it("keeps the cause", () => {
      const cause = new Error("boom");
      const error = PluginError.withMessage(PluginErrorCode.NO_STREAM, "custom", { cause });

      expect(error.cause).toBe(cause);
    });

    it("still creates a DisTubeError", () => {
      const error = DisTubeError.withMessage("CANNOT_RESOLVE_SONG", "custom message");

      expect(error).toBeInstanceOf(DisTubeError);
      expect(error).not.toBeInstanceOf(PluginError);
      expect(error.message).toBe("custom message");
    });
  });
});
