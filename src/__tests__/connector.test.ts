import { afterEach, describe, expect, it, vi } from "vitest";
import { NeteaseConnector } from "../index";

const BASE = "https://mock-netease.test";

function mockFetch(handler: (url: string) => unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(new Response(JSON.stringify(handler(url)), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
  });
}

describe("NeteaseConnector (contract)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("declares the required meta + configSchema", async () => {
    const c = new NeteaseConnector();
    expect(c.meta.id).toBe("netease-cloud-music");
    expect(c.meta.capabilities).toContain("search");
    expect(c.meta.capabilities).toContain("stream");
    expect(c.meta.configSchema?.find(f => f.key === "apiBaseUrl")).toBeDefined();
  });

  it("search returns track-shaped results", async () => {
    mockFetch((url) => {
      expect(url).toContain("/cloudsearch");
      expect(url).toContain(BASE);
      return {
        code: 200,
        result: {
          songCount: 1,
          songs: [{
            id: 12345,
            name: "晴天",
            ar: [{ id: 1, name: "周杰伦" }],
            al: { id: 2, name: "叶惠美", picUrl: "https://img/cover.jpg" },
            dt: 269000,
            fee: 0,
          }],
        },
      };
    });
    const c = new NeteaseConnector();
    await c.init({ apiBaseUrl: BASE });
    const r = await c.search({ keyword: "周杰伦", pageSize: 10 });
    expect(r.tracks).toHaveLength(1);
    const t = r.tracks[0];
    expect(t.id).toBe("netease:12345");
    expect(t.title).toBe("晴天");
    expect(t.artist).toBe("周杰伦");
    expect(t.album).toBe("叶惠美");
    expect(t.coverUrl).toBe("https://img/cover.jpg");
    expect(t.durationSec).toBe(269);
  });

  it("getStreamUrl returns a playable url + format", async () => {
    mockFetch((url) => {
      expect(url).toContain("/song/url/v1");
      return {
        code: 200,
        data: [{
          id: 12345,
          url: "https://m801.music.126.net/path/file.mp3",
          br: 320000,
          type: "mp3",
          expi: 1200,
        }],
      };
    });
    const c = new NeteaseConnector();
    await c.init({ apiBaseUrl: BASE });
    const info = await c.getStreamUrl("netease:12345");
    expect(info).not.toBeNull();
    expect(info!.url).toMatch(/^https?:\/\//);
    expect(info!.format).toBe("mp3");
  });

  it("getStreamUrl returns null for locked tracks (paid / unavailable)", async () => {
    mockFetch(() => ({ code: 200, data: [{ id: 12345, url: null, br: 0, type: "", expi: 0 }] }));
    const c = new NeteaseConnector();
    await c.init({ apiBaseUrl: BASE });
    expect(await c.getStreamUrl("netease:12345")).toBeNull();
  });
});
