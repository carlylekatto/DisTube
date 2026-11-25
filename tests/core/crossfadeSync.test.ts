import { describe, expect, it } from "vitest";
import { resolveCrossfadeSync } from "@/core/crossfadeSync";

const boundary = 100;
const now = 10_000;
const deadline = 14_000;

const expectWait = (currentTime: number, expectedMs: number) => {
  const decision = resolveCrossfadeSync(currentTime, boundary, now, deadline);
  expect(decision.action).toBe("wait");
  if (decision.action === "wait") expect(decision.waitMs).toBeCloseTo(expectedMs, 3);
};

describe("resolveCrossfadeSync", () => {
  it("swaps when the media clock reaches the boundary", () => {
    expect(resolveCrossfadeSync(boundary, boundary, now, deadline)).toEqual({ action: "swap" });
  });

  it("swaps within the epsilon around the boundary", () => {
    expect(resolveCrossfadeSync(99.97, boundary, now, deadline)).toEqual({ action: "swap" });
    expect(resolveCrossfadeSync(100.5, boundary, now, deadline)).toEqual({ action: "swap" });
  });

  it("waits for a lagging media clock", () => {
    expectWait(99.9, 100);
    expectWait(99.5, 100);
    expectWait(97.5, 100);
  });

  it("waits for exactly the remaining lag when it is shorter than the poll interval", () => {
    expectWait(99.94, 60);
  });

  it("aborts when the lag is beyond the resync window", () => {
    expect(resolveCrossfadeSync(96.9, boundary, now, deadline)).toEqual({ action: "abort", reason: "stalled" });
  });

  it("aborts when the resync deadline has passed", () => {
    expect(resolveCrossfadeSync(99.5, boundary, deadline, deadline)).toEqual({ action: "abort", reason: "stalled" });
  });

  it("aborts when the boundary was missed", () => {
    expect(resolveCrossfadeSync(100.8, boundary, now, deadline)).toEqual({ action: "abort", reason: "late" });
  });

  it("aborts when the playback position is unknown", () => {
    expect(resolveCrossfadeSync(Number.NaN, boundary, now, deadline)).toEqual({ action: "abort", reason: "invalid" });
    expect(resolveCrossfadeSync(99, Number.NaN, now, deadline)).toEqual({ action: "abort", reason: "invalid" });
  });
});
