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
} from "@dancingmusic/music-connect";
import { NeteaseApi } from "./api";
import type { NeteaseSong, NeteasePlaylist } from "./api";
import { parseLrc, mergeLyrics } from "./lyrics-parser";

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

export class NeteaseConnector implements MusicConnector {
  readonly meta: MusicConnectorMeta = {
    id: "netease-cloud-music",
    name: "网易云音乐",
    description: "Anonymous NetEase Cloud Music catalog through a compatible self-hosted API",
    familyId: "netease-cloud-music",
    variant: "anonymous",
    authRequirement: "none",
    supportedHosts: ["web", "desktop"],
    version: "0.5.3",
    capabilities: ["search", "stream", "lyrics", "playlist"],
    configSchema: [
      {
        key: "apiBaseUrl",
        label: "API 端点",
        type: "url",
        required: true,
        placeholder: "https://your-netease-api.example.com",
        help: "填写你信任并自行维护的兼容 HTTPS 网关；本仓库不绑定第三方公共代理。",
      },
    ],
  };

  private api: NeteaseApi | null = null;

  async init(config?: Record<string, unknown>): Promise<void> {
    const typed = config as NeteaseConnectorConfig | undefined;
    const apiBaseUrl = typeof typed?.apiBaseUrl === "string" ? typed.apiBaseUrl.trim() : "";
    if (!apiBaseUrl) {
      this.api = null;
      return;
    }
    const url = new URL(apiBaseUrl);
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
      throw new Error("网易云网关必须使用 HTTPS；本地开发仅允许 loopback HTTP");
    }
    if (url.username || url.password || url.search || url.hash) {
      throw new Error("网易云网关地址不能包含内嵌凭据、查询参数或片段");
    }
    this.api = new NeteaseApi(url.toString());
  }

  async search(query: MusicListQuery): Promise<MusicSearchResult> {
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
      pageSize,
    };
  }

  async getTrack(trackId: string): Promise<MusicTrack | null> {
    const neteaseId = this.parseId(trackId);
    if (!neteaseId || !this.api) return null;

    const res = await this.api.songDetail([neteaseId]);
    if (res.code !== 200 || !res.songs?.length) return null;

    return toMusicTrack(res.songs[0]);
  }

  async getStreamUrl(trackId: string): Promise<MusicStreamInfo | null> {
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
      expiresAt: item.expi ? Date.now() + item.expi * 1000 : undefined,
    };
  }

  async getLyrics(trackId: string): Promise<MusicLyrics | null> {
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
      timeline,
    };
  }

  async listPlaylists(query: MusicPlaylistQuery = {}): Promise<MusicPlaylistList> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const cat = query.category || "全部";
    // NetEase supports `hot` (default) and `new`. Treat `trending` as hot.
    const order: "hot" | "new" = query.sort === "new" ? "new" : "hot";
    if (!this.api) return { playlists: [], total: 0, page, pageSize };
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
    if (!id || !this.api) return { tracks: [], total: 0, page, pageSize };
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
