import { expect, test } from "vitest";
import { defaultOptions, Options } from "@";

test("Default DisTubeOptions", () => {
  expect(new Options({})).toEqual({
    emitAddListWhenCreatingQueue: true,
    emitAddSongWhenCreatingQueue: true,
    emitNewSongOnly: false,
    ffmpeg: {
      args: {
        global: {},
        input: {},
        output: {},
      },
      path: "ffmpeg",
    },
    joinNewVoiceChannel: true,
    nsfw: false,
    plugins: [],
    preload: {
      enabled: false,
      threshold: 15,
    },
    crossfade: {
      duration: 0,
      curve: "qsin",
      warmup: 5,
    },
    savePreviousSongs: true,
    stuckThreshold: 10000,
    unhandledError: "log",
  });
});

test("crossfade option defaults and validation", () => {
  expect(new Options({}).crossfade).toEqual({ duration: 0, curve: "qsin", warmup: 5 });
  expect(new Options({ crossfade: { duration: 6 } }).crossfade).toEqual({
    duration: 6,
    curve: "qsin",
    warmup: 5,
  });
  expect(new Options({ crossfade: { curve: "tri" } }).crossfade).toEqual({
    duration: 0,
    curve: "tri",
    warmup: 5,
  });
  expect(() => new Options(<any>{ crossfade: { duration: "6" } })).toThrow();
  expect(() => new Options(<any>{ crossfade: { duration: -1 } })).toThrow();
  expect(() => new Options(<any>{ crossfade: { duration: 13 } })).toThrow();
  expect(() => new Options(<any>{ crossfade: { curve: "" } })).toThrow();
  expect(() => new Options(<any>{ crossfade: { warmup: -1 } })).toThrow();
  expect(() => new Options(<any>{ crossfade: 6 })).toThrow();
});

test("preload option accepts a boolean or an object", () => {
  expect(new Options({ preload: true }).preload).toEqual({ enabled: true, threshold: 15 });
  expect(new Options({ preload: false }).preload).toEqual({ enabled: false, threshold: 15 });
  expect(new Options({ preload: { enabled: true } }).preload).toEqual({ enabled: true, threshold: 15 });
  expect(new Options({ preload: { threshold: 30 } }).preload).toEqual({ enabled: false, threshold: 30 });
  expect(new Options({ preload: { enabled: true, threshold: 30 } }).preload).toEqual({
    enabled: true,
    threshold: 30,
  });
  expect(() => {
    new Options(<any>{ preload: 1 });
  }).toThrow("Expected 'boolean' or 'object' for 'DisTubeOptions.preload', but got 1");
  expect(() => {
    new Options({ preload: { enabled: "yes" } } as any);
  }).toThrow("Expected 'boolean' for 'DisTubeOptions.preload.enabled', but got 'yes'");
  expect(() => {
    new Options({ preload: { threshold: -5 } });
  }).toThrow("Expected 'number' for 'DisTubeOptions.preload.threshold', but got -5");
  expect(() => {
    new Options({ preload: { unknown: true } } as any);
  }).toThrow("'unknown' does not need to be provided in DisTubeOptions.preload");
});

const typeOfOption = (option: string) => {
  switch (option) {
    case "plugins":
      return "Array<Plugin>";
    case "preload":
      // The preload option accepts a boolean or an object
      return "boolean' or 'object";
    default:
      return typeof (defaultOptions as any)[option];
  }
};

test("Validate DisTubeOptions", () => {
  expect(() => {
    new Options(<any>NaN);
  }).toThrow("Expected 'object' for 'DisTubeOptions', but got NaN");
  for (const option of Object.keys(defaultOptions)) {
    const options = {};
    (options as any)[option] = NaN;
    expect(() => {
      new Options(options);
    }).toThrow(`Expected '${typeOfOption(option)}' for 'DisTubeOptions.${option}', but got NaN`);
  }
  expect(() => {
    new Options({ invalidKey: "an invalid key" } as any);
  }).toThrow("'invalidKey' does not need to be provided in DisTubeOptions");
});
