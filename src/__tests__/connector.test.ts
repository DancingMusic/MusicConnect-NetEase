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
    expect(c.meta.capabilities).toContain("login");
    expect(c.meta.configSchema?.find(f => f.key === "apiBaseUrl")).toBeDefined();
    expect(c.meta.configSchema?.find(f => f.key === "cookie")).toBeDefined();
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

  it("listPlaylists returns playlist-shaped results", async () => {
    mockFetch((url) => {
      expect(url).toContain("/top/playlist");
      return {
        code: 200,
        total: 1,
        playlists: [{
          id: 991010,
          name: "经典华语",
          description: "时光长河里的好歌",
          coverImgUrl: "https://p1.music.126.net/cover.jpg",
          trackCount: 100,
          creator: { nickname: "网易云音乐" },
        }],
      };
    });
    const c = new NeteaseConnector();
    await c.init({ apiBaseUrl: BASE });
    const r = await c.listPlaylists!();
    expect(r.playlists).toHaveLength(1);
    const p = r.playlists[0];
    expect(p.id).toBe("netease-playlist:991010");
    expect(p.name).toBe("经典华语");
    expect(p.coverUrl).toContain("p1.music.126.net");
    expect(p.trackCount).toBe(100);
    expect(p.curator).toBe("网易云音乐");
    expect(p.externalUrl).toContain("music.163.com");
  });

  it("listPlaylists forwards sort param to upstream order=new", async () => {
    let sawOrder = "";
    mockFetch((url) => {
      const m = url.match(/[?&]order=([^&]+)/);
      if (m) sawOrder = m[1];
      return { code: 200, total: 0, playlists: [] };
    });
    const c = new NeteaseConnector();
    await c.init({ apiBaseUrl: BASE });
    await c.listPlaylists!({ sort: "new" });
    expect(sawOrder).toBe("new");
    await c.listPlaylists!({ sort: "hot" });
    expect(sawOrder).toBe("hot");
  });

  it("getPlaylistTracks returns the playlist's songs", async () => {
    mockFetch((url) => {
      expect(url).toContain("/playlist/track/all");
      expect(url).toContain("id=991010");
      return {
        code: 200,
        songs: [{
          id: 12345, name: "晴天",
          ar: [{ id: 1, name: "周杰伦" }],
          al: { id: 2, name: "叶惠美", picUrl: "https://x/c.jpg" },
          dt: 269000, fee: 0,
        }],
      };
    });
    const c = new NeteaseConnector();
    await c.init({ apiBaseUrl: BASE });
    const r = await c.getPlaylistTracks!("netease-playlist:991010");
    expect(r.tracks).toHaveLength(1);
    expect(r.tracks[0].id).toBe("netease:12345");
  });

  it("supports QR login and persists the returned cookie patch", async () => {
    let sawCookie = false;
    mockFetch((url) => {
      if (url.includes("/login/qr/key")) {
        return { code: 200, data: { unikey: "qr-key" } };
      }
      if (url.includes("/login/qr/create")) {
        expect(url).toContain("key=qr-key");
        return { code: 200, data: { qrurl: "https://qr.test/login", qrimg: "data:image/png;base64,abc" } };
      }
      if (url.includes("/login/qr/check")) {
        expect(url).toContain("key=qr-key");
        return { code: 803, cookie: "MUSIC_U=token", nickname: "tester" };
      }
      if (url.includes("/cloudsearch")) {
        sawCookie = url.includes("cookie=MUSIC_U%3Dtoken");
        return { code: 200, result: { songCount: 0, songs: [] } };
      }
      return { code: 200 };
    });

    const c = new NeteaseConnector();
    await c.init({ apiBaseUrl: BASE });
    const start = await c.login({ intent: "start" });
    expect(start.flow).toBe("qr");
    expect(start.flowId).toBe("qr-key");
    expect(start.actions?.[0]?.imageUrl).toContain("data:image/png");

    const done = await c.login({ intent: "continue", flowId: "qr-key" });
    expect(done.status).toBe("authenticated");
    expect(done.configPatch).toEqual({ cookie: "MUSIC_U=token" });

    await c.search({ keyword: "周杰伦" });
    expect(sawCookie).toBe(true);
  });
});
