#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
fixture_dir="$(mktemp -d)"
first="a-${fixture_dir##*.}"
first="${first,,}"
second="b-${first:2}"
first_host=first.example.test
second_host=second.example.test

compose() {
  local workspace="$1"
  shift
  docker compose -f docker/cloud-compose.yml --env-file "$fixture_dir/$workspace/workspace.env" "$@"
}

cleanup() {
  local status=$?
  for workspace in "$first" "$second"; do
    if [[ -f "$fixture_dir/$workspace/workspace.env" ]]; then
      if (( status )); then
        compose "$workspace" logs --tail 40 >&2 || true
      fi
      compose "$workspace" down --volumes --rmi local || true
    fi
  done
  rm -rf "$fixture_dir"
}
trap cleanup EXIT

# Reserve distinct loopback ports while selecting them for this fixture.
ports="$(node --input-type=module - <<'JS'
import { createServer } from 'node:net';
import { once } from 'node:events';
const listeners = [createServer(), createServer()];
await Promise.all(listeners.map((server) => {
  server.listen(0, '127.0.0.1');
  return once(server, 'listening');
}));
console.log(listeners.map((server) => server.address().port).join(' '));
listeners.forEach((server) => server.close());
JS
)"
read -r first_port second_port <<< "$ports"
node docker/init-workspace.mjs "$fixture_dir/$first" "$first_host" "$first_port"
node docker/init-workspace.mjs "$fixture_dir/$second" "$second_host" "$second_port"
compose "$first" up -d --build
compose "$second" up -d --build

request() {
  local port="$1" host="$2" route="$3"
  shift 3
  curl --silent --show-error --noproxy '*' --max-time 5 \
    -H "Host: $host" -H "Origin: https://$host" \
    "http://127.0.0.1:$port$route" "$@"
}

health() {
  request "$1" "$2" /_cloud/health --fail --retry 8 --retry-all-errors --retry-delay 1 >/dev/null
}

sign_in() {
  local port="$1" host="$2" workspace="$3" owner_key status
  owner_key="$(cat "$fixture_dir/$workspace/secrets/owner.key")"
  status="$(printf 'key=%s' "$owner_key" | request "$port" "$host" /_cloud/sign-in \
    --data-binary @- -D "$fixture_dir/headers" -o /dev/null -w '%{http_code}')"
  [[ "$status" == 303 ]] || return 1
  awk 'tolower($1) == "set-cookie:" { sub(/;.*/, "", $2); print $2 }' "$fixture_dir/headers"
}

assert_status() {
  local expected="$1" actual
  shift
  actual="$(request "$@" -o /dev/null -w '%{http_code}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected HTTP $expected, got $actual for $3" >&2
    return 1
  fi
}

health "$first_port" "$first_host"
health "$second_port" "$second_host"
assert_status 401 "$first_port" "$first_host" /links
assert_status 421 "$first_port" "$second_host" /_cloud/health
first_cookie="$(sign_in "$first_port" "$first_host" "$first")"
second_cookie="$(sign_in "$second_port" "$second_host" "$second")"
[[ -n "$first_cookie" && -n "$second_cookie" ]]
assert_status 401 "$second_port" "$second_host" /links -H "Cookie: $first_cookie"
assert_status 200 "$first_port" "$first_host" /links -H "Cookie: $first_cookie" \
  -X PUT -H 'Content-Type: application/json' --data '{"id":"fixture:compose","tokens":["fixture"]}'
assert_status 404 "$second_port" "$second_host" /links/fixture:compose -H "Cookie: $second_cookie"

# The workspace can receive requests from the ingress, but cannot open a
# connection to private addresses or to a service in its own namespace.
compose "$first" exec -T web node --input-type=module -e '
  import net from "node:net";
  for (const host of ["127.0.0.1", "169.254.169.254"]) {
    await new Promise((resolve, reject) => {
      const socket = net.connect({ host, port: 8787 });
      socket.once("connect", () => {
        socket.destroy();
        reject(new Error(`Unexpected connection to ${host}`));
      });
      socket.once("error", resolve);
      socket.setTimeout(3000, () => {
        socket.destroy();
        reject(new Error(`Expected immediate network rejection for ${host}`));
      });
    });
  }
'

compose "$first" restart web
health "$first_port" "$first_host"
assert_status 401 "$first_port" "$first_host" /links -H "Cookie: $first_cookie"
first_cookie="$(sign_in "$first_port" "$first_host" "$first")"
assert_status 200 "$first_port" "$first_host" /links/fixture:compose -H "Cookie: $first_cookie"
echo 'Hosted workspace isolation and persistence passed'
