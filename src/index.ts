/**
 * MusicConnect-NetEase — independent connector bundle.
 *
 * The class is the default export so the host's dynamic loader can do
 * `new mod.default()` without knowing internals.
 */
export { NeteaseConnector } from "./connectors/netease/index";
export type { NeteaseConnectorConfig } from "./connectors/netease/index";

import { NeteaseConnector } from "./connectors/netease/index";
export default NeteaseConnector;
