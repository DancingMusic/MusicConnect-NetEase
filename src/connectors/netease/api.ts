export interface NeteaseSearchResponse {
  result: {
    songs: NeteaseSong[];
    songCount: number;
  };
  code: number;
}

export interface NeteaseSong {
  id: number;
  name: string;
  ar: { id: number; name: string }[];
  al: { id: number; name: string; picUrl?: string };
  dt: number;
  fee: number;
  privilege?: { maxBrRate?: number };
}

export interface NeteaseDetailResponse {
  songs: NeteaseSong[];
  code: number;
}

export interface NeteaseUrlResponse {
  data: { id: number; url: string | null; br: number; type: string; expi: number }[];
  code: number;
}

export interface NeteaseLyricResponse {
  lrc?: { lyric: string };
  tlyric?: { lyric: string };
  code: number;
}

const DEFAULT_BASE = "https://netease-cloud-music-api-theta-ten.vercel.app";

export class NeteaseApi {
  private baseUrl: string;
  private cookie: string;

  constructor(baseUrl?: string, cookie = "") {
    this.baseUrl = (baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.cookie = cookie;
  }

  private async request<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    if (this.cookie && !url.searchParams.has("cookie")) {
      url.searchParams.set("cookie", this.cookie);
    }
    const res = await fetch(url.toString(), {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Netease API error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async search(keyword: string, page = 1, pageSize = 20): Promise<NeteaseSearchResponse> {
    return this.request<NeteaseSearchResponse>("/cloudsearch", {
      keywords: keyword,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      type: 1,
    });
  }

  async songDetail(ids: number[]): Promise<NeteaseDetailResponse> {
    return this.request<NeteaseDetailResponse>("/song/detail", {
      ids: ids.join(","),
    });
  }

  async songUrl(id: number, br = 320000): Promise<NeteaseUrlResponse> {
    return this.request<NeteaseUrlResponse>("/song/url/v1", {
      id,
      level: "higher",
      br,
    });
  }

  async lyric(id: number): Promise<NeteaseLyricResponse> {
    return this.request<NeteaseLyricResponse>("/lyric", { id });
  }

  async topPlaylist(cat = "全部", page = 1, pageSize = 30, order: "hot" | "new" = "hot"): Promise<NeteasePlaylistListResponse> {
    return this.request<NeteasePlaylistListResponse>("/top/playlist", {
      cat,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order,
    });
  }

  async playlistTrackAll(id: number, page = 1, pageSize = 30): Promise<NeteasePlaylistTracksResponse> {
    return this.request<NeteasePlaylistTracksResponse>("/playlist/track/all", {
      id,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
  }

  async loginQrKey(): Promise<NeteaseQrKeyResponse> {
    return this.request<NeteaseQrKeyResponse>("/login/qr/key", {
      timestamp: Date.now(),
    });
  }

  async loginQrCreate(key: string): Promise<NeteaseQrCreateResponse> {
    return this.request<NeteaseQrCreateResponse>("/login/qr/create", {
      key,
      qrimg: "true",
      timestamp: Date.now(),
    });
  }

  async loginQrCheck(key: string): Promise<NeteaseQrCheckResponse> {
    return this.request<NeteaseQrCheckResponse>("/login/qr/check", {
      key,
      timestamp: Date.now(),
    });
  }

  async logout(): Promise<{ code: number }> {
    return this.request<{ code: number }>("/logout", {
      timestamp: Date.now(),
    });
  }
}

export interface NeteasePlaylist {
  id: number;
  name: string;
  description?: string;
  coverImgUrl?: string;
  trackCount?: number;
  creator?: { nickname?: string };
}

export interface NeteasePlaylistListResponse {
  code: number;
  total: number;
  playlists: NeteasePlaylist[];
}

export interface NeteasePlaylistTracksResponse {
  code: number;
  songs?: NeteaseSong[];
}

export interface NeteaseQrKeyResponse {
  code: number;
  data?: { unikey?: string };
}

export interface NeteaseQrCreateResponse {
  code: number;
  data?: {
    qrurl?: string;
    qrimg?: string;
  };
}

export interface NeteaseQrCheckResponse {
  code: number;
  message?: string;
  cookie?: string;
  avatarUrl?: string;
  nickname?: string;
}
