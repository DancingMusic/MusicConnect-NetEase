// src/connectors/netease/api.ts
var DEFAULT_BASE = "https://netease-cloud-music-api-theta-ten.vercel.app";
var NeteaseApi = class {
  constructor(baseUrl, cookie = "") {
    this.baseUrl = (baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.cookie = cookie;
  }
  async request(path, params = {}) {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    if (this.cookie && !url.searchParams.has("cookie")) {
      url.searchParams.set("cookie", this.cookie);
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
  async loginQrKey() {
    return this.request("/login/qr/key", {
      timestamp: Date.now()
    });
  }
  async loginQrCreate(key) {
    return this.request("/login/qr/create", {
      key,
      qrimg: "true",
      timestamp: Date.now()
    });
  }
  async loginQrCheck(key) {
    return this.request("/login/qr/check", {
      key,
      timestamp: Date.now()
    });
  }
  async logout() {
    return this.request("/logout", {
      timestamp: Date.now()
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
var NETEASE_WEB_COOKIE_FLOW_ID = "netease-web-cookie";
var NETEASE_LOGIN_URL = "https://music.163.com/#/login";
var NETEASE_COOKIE_PRIORITY = [
  "MUSIC_U",
  "__csrf",
  "NMTID",
  "MUSIC_A",
  "__remember_me",
  "_ntes_nuid",
  "_ntes_nnid",
  "WEVNSM",
  "WNMCID",
  "JSESSIONID-WYYY"
];
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
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return void 0;
}
function cookieHasNeteaseLogin(cookie) {
  return /(?:^|;\s*)MUSIC_U=/.test(cookie);
}
var NeteaseConnector = class {
  constructor() {
    this.meta = {
      id: "netease-cloud-music",
      name: "\u7F51\u6613\u4E91\u97F3\u4E50",
      description: "NetEase Cloud Music data source connector with official web login",
      version: "0.5.1",
      capabilities: ["search", "stream", "lyrics", "playlist", "login"],
      configSchema: [
        {
          key: "apiBaseUrl",
          label: "API \u7AEF\u70B9",
          type: "url",
          required: false,
          default: "https://netease-cloud-music-api-theta-ten.vercel.app",
          placeholder: "https://your-netease-api.example.com",
          help: "\u9AD8\u7EA7\u8BBE\u7F6E\uFF1A\u81EA\u90E8\u7F72 NeteaseCloudMusicApi \u5730\u5740\u3002\u7559\u7A7A\u4F7F\u7528\u516C\u5F00\u4EE3\u7406\uFF08\u6709\u9650\u989D\uFF09\u3002"
        },
        {
          key: "cookie",
          label: "\u7F51\u6613\u4E91\u767B\u5F55 Cookie",
          type: "password",
          required: false,
          placeholder: "MUSIC_U=...",
          help: "\u5B98\u65B9\u7F51\u9875\u767B\u5F55\u6216\u626B\u7801\u767B\u5F55\u540E\u81EA\u52A8\u4FDD\u5B58\u3002\u666E\u901A\u7528\u6237\u4E0D\u9700\u8981\u624B\u52A8\u7C98\u8D34\u3002"
        }
      ]
    };
    this.cookie = "";
  }
  async init(config) {
    const typed = config;
    this.apiBaseUrl = typeof typed?.apiBaseUrl === "string" ? typed.apiBaseUrl : void 0;
    this.cookie = typeof typed?.cookie === "string" ? typed.cookie : "";
    this.api = new NeteaseApi(this.apiBaseUrl, this.cookie);
  }
  async login(request = { intent: "status" }) {
    const intent = request.intent ?? "status";
    if (intent === "status") {
      return this.cookie ? { status: "authenticated", message: "\u7F51\u6613\u4E91\u97F3\u4E50\u8D26\u53F7\u4F1A\u8BDD\u5DF2\u914D\u7F6E" } : { status: "anonymous", message: "\u672A\u767B\u5F55\u7F51\u6613\u4E91\u97F3\u4E50" };
    }
    if (intent === "logout") {
      try {
        if (this.cookie) await this.api.logout();
      } finally {
        this.cookie = "";
        this.api = new NeteaseApi(this.apiBaseUrl);
      }
      return {
        status: "anonymous",
        message: "\u5DF2\u9000\u51FA\u7F51\u6613\u4E91\u97F3\u4E50\u8D26\u53F7",
        configPatch: { cookie: "" }
      };
    }
    if (intent === "cancel") {
      return { status: "anonymous", message: "\u5DF2\u53D6\u6D88\u7F51\u6613\u4E91\u97F3\u4E50\u767B\u5F55" };
    }
    if (intent === "continue") {
      const capturedCookie = firstString(request.input?.cookie, request.input?.authCookie);
      if (capturedCookie) return this.acceptWebCookie(capturedCookie);
      if (request.flowId === NETEASE_WEB_COOKIE_FLOW_ID) return this.startWebLogin("\u8BF7\u7EE7\u7EED\u5728\u7F51\u6613\u4E91\u5B98\u65B9\u767B\u5F55\u7A97\u53E3\u5B8C\u6210\u767B\u5F55");
      if (!request.flowId) return { status: "error", message: "\u7F3A\u5C11\u7F51\u6613\u4E91\u767B\u5F55 flowId" };
      return this.continueQrLogin(request.flowId);
    }
    return this.startWebLogin();
  }
  startWebLogin(message = "\u5728\u7F51\u6613\u4E91\u5B98\u65B9\u9875\u9762\u5B8C\u6210\u767B\u5F55\u540E\uFF0CDancingMusic \u4F1A\u81EA\u52A8\u4FDD\u5B58\u5F53\u524D\u8D26\u53F7\u4F1A\u8BDD\u3002") {
    return {
      status: "pending",
      flow: "browser",
      flowId: NETEASE_WEB_COOKIE_FLOW_ID,
      actions: [{
        type: "open-url",
        label: "\u6253\u5F00\u7F51\u6613\u4E91\u5B98\u65B9\u767B\u5F55\u7A97\u53E3",
        url: NETEASE_LOGIN_URL,
        cookieCapture: {
          provider: "netease",
          title: "\u7F51\u6613\u4E91\u97F3\u4E50\u767B\u5F55",
          domains: ["163.com", "music.163.com", "netease.com"],
          requiredCookieNames: ["MUSIC_U"],
          cookieNames: NETEASE_COOKIE_PRIORITY,
          message: "\u684C\u9762\u7AEF\u4F1A\u5728\u64AD\u653E\u5668\u5185\u6253\u5F00\u7F51\u6613\u4E91\u5B98\u65B9\u767B\u5F55\u9875\uFF0C\u5E76\u81EA\u52A8\u8BFB\u53D6 MUSIC_U cookie\u3002"
        },
        message
      }],
      message
    };
  }
  acceptWebCookie(cookie) {
    if (!cookieHasNeteaseLogin(cookie)) {
      return { status: "error", message: "\u672A\u8BFB\u53D6\u5230\u7F51\u6613\u4E91 MUSIC_U\uFF0C\u4F1A\u8BDD\u65E0\u6548" };
    }
    this.cookie = cookie;
    this.api = new NeteaseApi(this.apiBaseUrl, this.cookie);
    return {
      status: "authenticated",
      message: "\u7F51\u6613\u4E91\u97F3\u4E50\u767B\u5F55\u6210\u529F",
      configPatch: { cookie }
    };
  }
  async startQrLogin() {
    const keyRes = await this.api.loginQrKey();
    const key = keyRes.data?.unikey;
    if (keyRes.code !== 200 || !key) {
      throw new Error("\u7F51\u6613\u4E91\u4E8C\u7EF4\u7801\u767B\u5F55 key \u83B7\u53D6\u5931\u8D25");
    }
    const qrRes = await this.api.loginQrCreate(key);
    if (qrRes.code !== 200 || !qrRes.data?.qrimg && !qrRes.data?.qrurl) {
      throw new Error("\u7F51\u6613\u4E91\u4E8C\u7EF4\u7801\u751F\u6210\u5931\u8D25");
    }
    return {
      status: "pending",
      flow: "qr",
      flowId: key,
      actions: [{
        type: "qr",
        label: "\u7F51\u6613\u4E91\u97F3\u4E50\u626B\u7801\u767B\u5F55",
        qrUrl: qrRes.data.qrurl,
        imageUrl: qrRes.data.qrimg,
        message: "\u4F7F\u7528\u7F51\u6613\u4E91\u97F3\u4E50 App \u626B\u7801\u786E\u8BA4"
      }],
      expiresAt: Date.now() + 3 * 60 * 1e3,
      nextPollMs: 2500,
      message: "\u4F7F\u7528\u7F51\u6613\u4E91\u97F3\u4E50 App \u626B\u7801\u786E\u8BA4"
    };
  }
  async continueQrLogin(flowId) {
    const res = await this.api.loginQrCheck(flowId);
    if (res.code === 803 && res.cookie) {
      this.cookie = res.cookie;
      this.api = new NeteaseApi(this.apiBaseUrl, this.cookie);
      return {
        status: "authenticated",
        user: { name: res.nickname, avatarUrl: res.avatarUrl },
        message: res.message || "\u7F51\u6613\u4E91\u97F3\u4E50\u767B\u5F55\u6210\u529F",
        configPatch: { cookie: res.cookie }
      };
    }
    if (res.code === 800) {
      return { status: "expired", message: res.message || "\u4E8C\u7EF4\u7801\u5DF2\u8FC7\u671F" };
    }
    if (res.code === 801 || res.code === 802) {
      return {
        status: "pending",
        flow: "qr",
        flowId,
        message: res.message || "\u7B49\u5F85\u626B\u7801\u786E\u8BA4",
        nextPollMs: 2500
      };
    }
    return { status: "error", message: res.message || `\u7F51\u6613\u4E91\u767B\u5F55\u72B6\u6001\u5F02\u5E38: ${res.code}` };
  }
  async search(query) {
    const keyword = query.keyword || "";
    if (!keyword) {
      return { tracks: [], total: 0, page: query.page ?? 1, pageSize: query.pageSize ?? 20 };
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
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
    if (!neteaseId) return null;
    const res = await this.api.songDetail([neteaseId]);
    if (res.code !== 200 || !res.songs?.length) return null;
    return toMusicTrack(res.songs[0]);
  }
  async getStreamUrl(trackId) {
    const neteaseId = this.parseId(trackId);
    if (!neteaseId) return null;
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
    if (!neteaseId) return null;
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
    if (!id) return { tracks: [], total: 0, page, pageSize };
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
