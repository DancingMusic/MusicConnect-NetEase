import type {
  MusicConnector,
  MusicConnectorMeta,
  MusicSearchResult,
  MusicStreamInfo,
  MusicLyrics,
  MusicListQuery,
  MusicTrack,
  MusicPlaylist,
  MusicPlaylistList,
  MusicPlaylistQuery,
  MusicConnectorLoginRequest,
  MusicConnectorLoginResult,
} from "@dancingmusic/music-store";
import { NeteaseApi } from "./api";
import type { NeteaseSong, NeteasePlaylist } from "./api";
import { parseLrc, mergeLyrics } from "./lyrics-parser";

const NETEASE_WEB_COOKIE_FLOW_ID = "netease-web-cookie";
const NETEASE_LOGIN_URL = "https://music.163.com/#/login";
const NETEASE_COOKIE_PRIORITY = [
  "MUSIC_U",
  "__csrf",
  "NMTID",
  "MUSIC_A",
  "__remember_me",
  "_ntes_nuid",
  "_ntes_nnid",
  "WEVNSM",
  "WNMCID",
  "JSESSIONID-WYYY",
];

function toMusicPlaylist(p: NeteasePlaylist): MusicPlaylist {
  return {
    id: `netease-playlist:${p.id}`,
    name: p.name,
    description: p.description,
    coverUrl: p.coverImgUrl,
    trackCount: p.trackCount,
    curator: p.creator?.nickname,
    externalUrl: `https://music.163.com/#/playlist?id=${p.id}`,
  };
}

export interface NeteaseConnectorConfig {
  apiBaseUrl?: string;
  cookie?: string;
}

function toMusicTrack(song: NeteaseSong): MusicTrack {
  return {
    id: `netease:${song.id}`,
    title: song.name,
    artist: song.ar.map(a => a.name).join(", "),
    album: song.al.name,
    coverUrl: song.al.picUrl,
    durationSec: Math.round(song.dt / 1000),
    price: 0,
    currency: "CNY",
    version: "1.0.0",
    createdAt: "",
    updatedAt: "",
  };
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function cookieHasNeteaseLogin(cookie: string): boolean {
  return /(?:^|;\s*)MUSIC_U=/.test(cookie);
}

export class NeteaseConnector implements MusicConnector {
  readonly meta: MusicConnectorMeta = {
    id: "netease-cloud-music",
    name: "网易云音乐",
    description: "NetEase Cloud Music data source connector with official web login",
    version: "0.5.1",
    capabilities: ["search", "stream", "lyrics", "playlist", "login"],
    configSchema: [
      {
        key: "apiBaseUrl",
        label: "API 端点",
        type: "url",
        required: false,
        default: "https://netease-cloud-music-api-theta-ten.vercel.app",
        placeholder: "https://your-netease-api.example.com",
        help: "高级设置：自部署 NeteaseCloudMusicApi 地址。留空使用公开代理（有限额）。",
      },
      {
        key: "cookie",
        label: "网易云登录 Cookie",
        type: "password",
        required: false,
        placeholder: "MUSIC_U=...",
        help: "官方网页登录或扫码登录后自动保存。普通用户不需要手动粘贴。",
      },
    ],
  };

  private api!: NeteaseApi;
  private apiBaseUrl: string | undefined;
  private cookie = "";

  async init(config?: Record<string, unknown>): Promise<void> {
    const typed = config as NeteaseConnectorConfig | undefined;
    this.apiBaseUrl = typeof typed?.apiBaseUrl === "string" ? typed.apiBaseUrl : undefined;
    this.cookie = typeof typed?.cookie === "string" ? typed.cookie : "";
    this.api = new NeteaseApi(this.apiBaseUrl, this.cookie);
  }

  async login(request: MusicConnectorLoginRequest = { intent: "status" }): Promise<MusicConnectorLoginResult> {
    const intent = request.intent ?? "status";
    if (intent === "status") {
      return this.cookie
        ? { status: "authenticated", message: "网易云音乐账号会话已配置" }
        : { status: "anonymous", message: "未登录网易云音乐" };
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
        message: "已退出网易云音乐账号",
        configPatch: { cookie: "" },
      };
    }
    if (intent === "cancel") {
      return { status: "anonymous", message: "已取消网易云音乐登录" };
    }
    if (intent === "continue") {
      const capturedCookie = firstString(request.input?.cookie, request.input?.authCookie);
      if (capturedCookie) return this.acceptWebCookie(capturedCookie);
      if (request.flowId === NETEASE_WEB_COOKIE_FLOW_ID) return this.startWebLogin("请继续在网易云官方登录窗口完成登录");
      if (!request.flowId) return { status: "error", message: "缺少网易云登录 flowId" };
      return this.continueQrLogin(request.flowId);
    }
    return this.startWebLogin();
  }

  private startWebLogin(message = "在网易云官方页面完成登录后，DancingMusic 会自动保存当前账号会话。"): MusicConnectorLoginResult {
    return {
      status: "pending",
      flow: "browser",
      flowId: NETEASE_WEB_COOKIE_FLOW_ID,
      actions: [{
        type: "open-url",
        label: "打开网易云官方登录窗口",
        url: NETEASE_LOGIN_URL,
        cookieCapture: {
          provider: "netease",
          title: "网易云音乐登录",
          domains: ["163.com", "music.163.com", "netease.com"],
          requiredCookieNames: ["MUSIC_U"],
          cookieNames: NETEASE_COOKIE_PRIORITY,
          message: "桌面端会在播放器内打开网易云官方登录页，并自动读取 MUSIC_U cookie。",
        },
        message,
      }],
      message,
    };
  }

  private acceptWebCookie(cookie: string): MusicConnectorLoginResult {
    if (!cookieHasNeteaseLogin(cookie)) {
      return { status: "error", message: "未读取到网易云 MUSIC_U，会话无效" };
    }
    this.cookie = cookie;
    this.api = new NeteaseApi(this.apiBaseUrl, this.cookie);
    return {
      status: "authenticated",
      message: "网易云音乐登录成功",
      configPatch: { cookie },
    };
  }

  private async startQrLogin(): Promise<MusicConnectorLoginResult> {
    const keyRes = await this.api.loginQrKey();
    const key = keyRes.data?.unikey;
    if (keyRes.code !== 200 || !key) {
      throw new Error("网易云二维码登录 key 获取失败");
    }
    const qrRes = await this.api.loginQrCreate(key);
    if (qrRes.code !== 200 || (!qrRes.data?.qrimg && !qrRes.data?.qrurl)) {
      throw new Error("网易云二维码生成失败");
    }
    return {
      status: "pending",
      flow: "qr",
      flowId: key,
      actions: [{
        type: "qr",
        label: "网易云音乐扫码登录",
        qrUrl: qrRes.data.qrurl,
        imageUrl: qrRes.data.qrimg,
        message: "使用网易云音乐 App 扫码确认",
      }],
      expiresAt: Date.now() + 3 * 60 * 1000,
      nextPollMs: 2500,
      message: "使用网易云音乐 App 扫码确认",
    };
  }

  private async continueQrLogin(flowId: string): Promise<MusicConnectorLoginResult> {
    const res = await this.api.loginQrCheck(flowId);
    if (res.code === 803 && res.cookie) {
      this.cookie = res.cookie;
      this.api = new NeteaseApi(this.apiBaseUrl, this.cookie);
      return {
        status: "authenticated",
        user: { name: res.nickname, avatarUrl: res.avatarUrl },
        message: res.message || "网易云音乐登录成功",
        configPatch: { cookie: res.cookie },
      };
    }
    if (res.code === 800) {
      return { status: "expired", message: res.message || "二维码已过期" };
    }
    if (res.code === 801 || res.code === 802) {
      return {
        status: "pending",
        flow: "qr",
        flowId,
        message: res.message || "等待扫码确认",
        nextPollMs: 2500,
      };
    }
    return { status: "error", message: res.message || `网易云登录状态异常: ${res.code}` };
  }

  async search(query: MusicListQuery): Promise<MusicSearchResult> {
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
      pageSize,
    };
  }

  async getTrack(trackId: string): Promise<MusicTrack | null> {
    const neteaseId = this.parseId(trackId);
    if (!neteaseId) return null;

    const res = await this.api.songDetail([neteaseId]);
    if (res.code !== 200 || !res.songs?.length) return null;

    return toMusicTrack(res.songs[0]);
  }

  async getStreamUrl(trackId: string): Promise<MusicStreamInfo | null> {
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
      expiresAt: item.expi ? Date.now() + item.expi * 1000 : undefined,
    };
  }

  async getLyrics(trackId: string): Promise<MusicLyrics | null> {
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
      timeline,
    };
  }

  async listPlaylists(query: MusicPlaylistQuery = {}): Promise<MusicPlaylistList> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const cat = query.category || "全部";
    // NetEase supports `hot` (default) and `new`. Treat `trending` as hot.
    const order: "hot" | "new" = query.sort === "new" ? "new" : "hot";
    const res = await this.api.topPlaylist(cat, page, pageSize, order);
    if (res.code !== 200 || !res.playlists) {
      return { playlists: [], total: 0, page, pageSize };
    }
    return {
      playlists: res.playlists.map(toMusicPlaylist),
      total: res.total ?? res.playlists.length,
      page,
      pageSize,
    };
  }

  async getPlaylistTracks(
    playlistId: string,
    opts: { page?: number; pageSize?: number } = {},
  ): Promise<MusicSearchResult> {
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
      total: res.songs.length, // upstream doesn't return total, so report what we got
      page,
      pageSize,
    };
  }

  private parseId(trackId: string): number | null {
    const raw = trackId.startsWith("netease:") ? trackId.slice(8) : trackId;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }

  private parsePlaylistId(id: string): number | null {
    const raw = id.startsWith("netease-playlist:") ? id.slice("netease-playlist:".length) : id;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }
}
