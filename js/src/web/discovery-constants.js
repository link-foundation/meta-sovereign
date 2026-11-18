// Shared discovery values have no browser/storage/codec consumer.
// Older servers ignore the query and return their usual status. Updated
// servers identify themselves without scanning/verifying message history.
export const DISCOVERY_PATH = '/api/status?probe=1';
// The ports a server is looked for on, ours (8787) first; `serve`
// warns when it listens on another one (R-Y58).
export const DEFAULT_PORTS = Object.freeze([8787, 8788, 7001, 7002, 3000]);
// Safari keeps an https page from asking http://127.0.0.1 anything but
// still shows it pictures from there: the server's picture is this
// wide, one pixel high when it serves its own copy of the app, two when
// that copy is off, two more when it answers https as well
// (../server/hosted-ui.js).
export const BEACON_PATH = '/api/beacon.svg';
export const BEACON_WIDTH = 23;
