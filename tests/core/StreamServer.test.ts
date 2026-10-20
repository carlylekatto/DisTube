import { Readable } from "node:stream";
import { GatewayIntentBits, IntentsBitField } from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisTube, type Plugin, type StreamRequest } from "@";

const createMockClient = () =>
  ({
    options: {
      intents: new IntentsBitField([GatewayIntentBits.GuildVoiceStates]),
    },
    user: { id: "987654321098765432" },
    login: vi.fn(),
  }) as any;

const createDistube = (plugins: Plugin[] = []) => new DisTube(createMockClient(), { plugins: plugins as any });

const servers: DisTube[] = [];

afterEach(async () => {
  for (const distube of servers.splice(0)) await distube.destroy();
});

describe("StreamServer", () => {
  it("starts on the first registration and serves the handler", async () => {
    const distube = createDistube();
    servers.push(distube);

    distube.streams.register("test", () => ({
      body: Readable.from(["hello ", "world"]),
      contentType: "audio/mp3",
    }));

    const url = await distube.streams.url("test");
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mp3");
    expect(await response.text()).toBe("hello world");
  });

  it("gives the path and the query to the handler", async () => {
    const distube = createDistube();
    servers.push(distube);
    const handler = vi.fn((_req: StreamRequest) => ({ body: Readable.from(["ok"]) }));

    distube.streams.register("test", handler);
    const url = await distube.streams.url("test", "v/abc123", { itag: 251 });
    await fetch(url);

    expect(handler).toHaveBeenCalledTimes(1);
    const request = handler.mock.calls[0]?.[0];
    expect(request?.path).toBe("v/abc123");
    expect(request?.query.get("itag")).toBe("251");
  });

  it("answers 404 when there is no handler for the source", async () => {
    const distube = createDistube();
    servers.push(distube);

    const url = await distube.streams.url("unknown");
    const response = await fetch(url);

    expect(response.status).toBe(404);
  });

  it("answers 404 when the handler returns nothing", async () => {
    const distube = createDistube();
    servers.push(distube);

    distube.streams.register("test", () => null);
    const url = await distube.streams.url("test");
    const response = await fetch(url);

    expect(response.status).toBe(404);
  });

  it("answers 404 when the prefix does not match", async () => {
    const distube = createDistube();
    servers.push(distube);

    distube.streams.register("test", () => ({ body: Readable.from(["ok"]) }));
    const url = await distube.streams.url("test");
    const wrong = url.replace(distube.streams.prefix, "wrong-prefix");

    const response = await fetch(wrong);

    expect(response.status).toBe(404);
  });

  it("unregisters the source when the handle is disposed", async () => {
    const distube = createDistube();
    servers.push(distube);

    const route = distube.streams.register("test", () => ({ body: Readable.from(["ok"]) }));
    const url = await distube.streams.url("test");
    expect((await fetch(url)).status).toBe(200);

    route.dispose();

    expect((await fetch(url)).status).toBe(404);
  });

  it("uses a random prefix and an ephemeral port", async () => {
    const distube = createDistube();
    servers.push(distube);

    distube.streams.register("test", () => ({ body: Readable.from(["ok"]) }));
    const url = await distube.streams.url("test");

    expect(distube.streams.prefix).toMatch(/^[\da-f]{16}$/u);
    expect(url).toContain(`127.0.0.1:${new URL(url).port}`);
    expect(Number(new URL(url).port)).toBeGreaterThan(0);
  });

  it("gives the offset of the range request to the handler", async () => {
    const distube = createDistube();
    servers.push(distube);
    const handler = vi.fn((_req: StreamRequest) => ({ body: Readable.from(["ok"]), size: 100 }));

    distube.streams.register("test", handler);
    const url = await distube.streams.url("test");
    await fetch(url, { headers: { Range: "bytes=42-" } });

    expect(handler.mock.calls[0]?.[0]?.offset).toBe(42);
  });

  it("answers 206 with the content range when the size is known", async () => {
    const distube = createDistube();
    servers.push(distube);

    distube.streams.register("test", () => ({
      body: Readable.from(["rest"]),
      contentType: "audio/flac",
      size: 100,
    }));
    const url = await distube.streams.url("test");
    const response = await fetch(url, { headers: { Range: "bytes=42-" } });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 42-99/100");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
  });

  it("is closed by DisTube#destroy()", async () => {
    const distube = createDistube();

    distube.streams.register("test", () => ({ body: Readable.from(["ok"]) }));
    const url = await distube.streams.url("test");

    await distube.destroy();

    await expect(fetch(url)).rejects.toThrow();
  });

  it("is reachable from a plugin through the streams getter", async () => {
    const distube = createDistube();
    servers.push(distube);

    let pluginStreams: unknown;
    const plugin = {
      init(d: DisTube) {
        pluginStreams = d.streams;
      },
    } as unknown as Plugin;

    distube.plugins.push(plugin as any);
    plugin.init(distube);

    expect(pluginStreams).toBe(distube.streams);
  });
});
