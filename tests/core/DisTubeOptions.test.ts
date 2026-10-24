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
    savePreviousSongs: true,
    stuckThreshold: 10000,
    unhandledError: "log",
  });
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
