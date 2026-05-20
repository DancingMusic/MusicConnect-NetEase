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

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
  }

  private async request<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
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
}
