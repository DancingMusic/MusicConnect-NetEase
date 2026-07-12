import { MusicConnector, MusicConnectorMeta, MusicListQuery, MusicSearchResult, MusicTrack, MusicStreamInfo, MusicLyrics, MusicPlaylistQuery, MusicPlaylistList } from '@dancingmusic/music-connect';

interface NeteaseConnectorConfig {
    apiBaseUrl?: string;
}
declare class NeteaseConnector implements MusicConnector {
    readonly meta: MusicConnectorMeta;
    private api;
    init(config?: Record<string, unknown>): Promise<void>;
    search(query: MusicListQuery): Promise<MusicSearchResult>;
    getTrack(trackId: string): Promise<MusicTrack | null>;
    getStreamUrl(trackId: string): Promise<MusicStreamInfo | null>;
    getLyrics(trackId: string): Promise<MusicLyrics | null>;
    listPlaylists(query?: MusicPlaylistQuery): Promise<MusicPlaylistList>;
    getPlaylistTracks(playlistId: string, opts?: {
        page?: number;
        pageSize?: number;
    }): Promise<MusicSearchResult>;
    private parseId;
    private parsePlaylistId;
}

/**
 * MusicConnect-NetEase — independent connector bundle.
 *
 * The class is the default export so the host's dynamic loader can do
 * `new mod.default()` without knowing internals.
 */

export { NeteaseConnector, type NeteaseConnectorConfig, NeteaseConnector as default };
