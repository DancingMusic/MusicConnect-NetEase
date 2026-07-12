// src/connectors/netease/api.ts
var NeteaseApi = class {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  async request(path, params = {}) {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), {
      headers: { "Content-Type": "application/json" }
    });
    if (!res.ok) {
      throw new Error(`Netease API error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }
  async search(keyword, page = 1, pageSize = 20) {
    return this.request("/cloudsearch", {
      keywords: keyword,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      type: 1
    });
  }
  async songDetail(ids) {
    return this.request("/song/detail", {
      ids: ids.join(",")
    });
  }
  async songUrl(id, br = 32e4) {
    return this.request("/song/url/v1", {
      id,
      level: "higher",
      br
    });
  }
  async lyric(id) {
    return this.request("/lyric", { id });
  }
  async topPlaylist(cat = "\u5168\u90E8", page = 1, pageSize = 30, order = "hot") {
    return this.request("/top/playlist", {
      cat,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order
    });
  }
  async playlistTrackAll(id, page = 1, pageSize = 30) {
    return this.request("/playlist/track/all", {
      id,
      limit: pageSize,
      offset: (page - 1) * pageSize
    });
  }
};

// src/connectors/netease/lyrics-parser.ts
function parseLrc(lrcText) {
  const lines = [];
  const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;
  for (const raw of lrcText.split("\n")) {
    const match = raw.match(regex);
    if (!match) continue;
    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3].padEnd(3, "0"), 10) : 0;
    const text = match[4].trim();
    if (!text) continue;
    lines.push({ time: min * 60 + sec + ms / 1e3, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}
function mergeLyrics(original, translated) {
  const transMap = /* @__PURE__ */ new Map();
  for (const line of translated) {
    const key = Math.round(line.time * 10);
    transMap.set(key, line.text);
  }
  return original.map((line) => {
    const key = Math.round(line.time * 10);
    const trans = transMap.get(key);
    return trans ? { ...line, translated: trans } : line;
  });
}

// src/connectors/netease/index.ts
function toMusicPlaylist(p) {
  return {
    id: `netease-playlist:${p.id}`,
    name: p.name,
    description: p.description,
    coverUrl: p.coverImgUrl,
    trackCount: p.trackCount,
    curator: p.creator?.nickname,
    externalUrl: `https://music.163.com/#/playlist?id=${p.id}`
  };
}
function toMusicTrack(song) {
  return {
    id: `netease:${song.id}`,
    title: song.name,
    artist: song.ar.map((a) => a.name).join(", "),
    album: song.al.name,
    coverUrl: song.al.picUrl,
    durationSec: Math.round(song.dt / 1e3),
    price: 0,
    currency: "CNY",
    version: "1.0.0",
    createdAt: "",
    updatedAt: ""
  };
}
var NeteaseConnector = class {
  constructor() {
    this.meta = {
      id: "netease-cloud-music",
      name: "\u7F51\u6613\u4E91\u97F3\u4E50",
      description: "Anonymous NetEase Cloud Music catalog through a compatible self-hosted API",
      familyId: "netease-cloud-music",
      variant: "anonymous",
      authRequirement: "none",
      supportedHosts: ["web", "desktop"],
      version: "0.5.2",
      capabilities: ["search", "stream", "lyrics", "playlist"],
      configSchema: [
        {
          key: "apiBaseUrl",
          label: "API \u7AEF\u70B9",
          type: "url",
          required: true,
          placeholder: "https://your-netease-api.example.com",
          help: "\u586B\u5199\u4F60\u4FE1\u4EFB\u5E76\u81EA\u884C\u7EF4\u62A4\u7684\u517C\u5BB9 HTTPS \u7F51\u5173\uFF1B\u672C\u4ED3\u5E93\u4E0D\u7ED1\u5B9A\u7B2C\u4E09\u65B9\u516C\u5171\u4EE3\u7406\u3002"
        }
      ]
    };
    this.api = null;
  }
  async init(config) {
    const typed = config;
    const apiBaseUrl = typeof typed?.apiBaseUrl === "string" ? typed.apiBaseUrl.trim() : "";
    if (!apiBaseUrl) {
      this.api = null;
      return;
    }
    const url = new URL(apiBaseUrl);
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
      throw new Error("\u7F51\u6613\u4E91\u7F51\u5173\u5FC5\u987B\u4F7F\u7528 HTTPS\uFF1B\u672C\u5730\u5F00\u53D1\u4EC5\u5141\u8BB8 loopback HTTP");
    }
    this.api = new NeteaseApi(apiBaseUrl);
  }
  async search(query) {
    const keyword = query.keyword || "";
    if (!keyword) {
      return { tracks: [], total: 0, page: query.page ?? 1, pageSize: query.pageSize ?? 20 };
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    if (!this.api) return { tracks: [], total: 0, page, pageSize };
    const res = await this.api.search(keyword, page, pageSize);
    if (res.code !== 200 || !res.result?.songs) {
      return { tracks: [], total: 0, page, pageSize };
    }
    return {
      tracks: res.result.songs.map(toMusicTrack),
      total: res.result.songCount,
      page,
      pageSize
    };
  }
  async getTrack(trackId) {
    const neteaseId = this.parseId(trackId);
    if (!neteaseId || !this.api) return null;
    const res = await this.api.songDetail([neteaseId]);
    if (res.code !== 200 || !res.songs?.length) return null;
    return toMusicTrack(res.songs[0]);
  }
  async getStreamUrl(trackId) {
    const neteaseId = this.parseId(trackId);
    if (!neteaseId || !this.api) return null;
    const res = await this.api.songUrl(neteaseId);
    if (res.code !== 200 || !res.data?.length) return null;
    const item = res.data[0];
    if (!item.url) return null;
    return {
      url: item.url,
      format: item.type || "mp3",
      bitrate: item.br,
      expiresAt: item.expi ? Date.now() + item.expi * 1e3 : void 0
    };
  }
  async getLyrics(trackId) {
    const neteaseId = this.parseId(trackId);
    if (!neteaseId || !this.api) return null;
    const res = await this.api.lyric(neteaseId);
    if (res.code !== 200 || !res.lrc?.lyric) return null;
    const original = parseLrc(res.lrc.lyric);
    let timeline = original;
    if (res.tlyric?.lyric) {
      const translated = parseLrc(res.tlyric.lyric);
      timeline = mergeLyrics(original, translated);
    }
    return {
      text: res.lrc.lyric,
      translated: res.tlyric?.lyric,
      timeline
    };
  }
  async listPlaylists(query = {}) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const cat = query.category || "\u5168\u90E8";
    const order = query.sort === "new" ? "new" : "hot";
    if (!this.api) return { playlists: [], total: 0, page, pageSize };
    const res = await this.api.topPlaylist(cat, page, pageSize, order);
    if (res.code !== 200 || !res.playlists) {
      return { playlists: [], total: 0, page, pageSize };
    }
    return {
      playlists: res.playlists.map(toMusicPlaylist),
      total: res.total ?? res.playlists.length,
      page,
      pageSize
    };
  }
  async getPlaylistTracks(playlistId, opts = {}) {
    const id = this.parsePlaylistId(playlistId);
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 30;
    if (!id || !this.api) return { tracks: [], total: 0, page, pageSize };
    const res = await this.api.playlistTrackAll(id, page, pageSize);
    if (res.code !== 200 || !res.songs) {
      return { tracks: [], total: 0, page, pageSize };
    }
    return {
      tracks: res.songs.map(toMusicTrack),
      total: res.songs.length,
      // upstream doesn't return total, so report what we got
      page,
      pageSize
    };
  }
  parseId(trackId) {
    const raw = trackId.startsWith("netease:") ? trackId.slice(8) : trackId;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }
  parsePlaylistId(id) {
    const raw = id.startsWith("netease-playlist:") ? id.slice("netease-playlist:".length) : id;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }
};

// src/index.ts
var index_default = NeteaseConnector;
export {
  NeteaseConnector,
  index_default as default
};
