#!/bin/sh
set -eu
umask 077

# Node.js v26.13.0 signed release checksums, using the same version as desktop CI.
version=v26.13.0
case "$(uname -s):$(uname -m)" in
  Linux:x86_64)
    platform=linux-x64
    digest=5848553868b402d3fabb5b09270649977780a390f832155721025a08b5104455
    ;;
  Linux:aarch64|Linux:arm64)
    platform=linux-arm64
    digest=439e9c438acdf6a6ffe47418da709153d66c4bed812e30a473faacb107dd2791
    ;;
  Darwin:x86_64)
    platform=darwin-x64
    digest=525c9b29bb0263d687de60a4cec0e2a6db876a8eb032369e5795eca71e7c358e
    ;;
  Darwin:arm64)
    platform=darwin-arm64
    digest=d38bd5e5a2ddce6bbb5ce45e46e208337da4d51fffe611e567fd32073d6439f6
    ;;
  *) exit 1 ;;
esac

metadata() {
  case "$platform" in
    linux-*) stat -c '%u %a' "$1" ;;
    darwin-*) stat -f '%u %Lp' "$1" ;;
  esac
}

owned_directory() {
  [ ! -L "$1" ] && [ -d "$1" ] || return 1
  info=$(metadata "$1") || return 1
  [ "${info% *}" = "$uid" ] && [ "$((0${info#* } & $2))" -eq 0 ]
}

runtime() {
  executable="$1/bin/node"
  npm="$1/lib/node_modules/npm/bin/npm-cli.js"
  [ ! -L "$executable" ] && [ -f "$executable" ] && [ -x "$executable" ] &&
    [ ! -L "$npm" ] && [ -f "$npm" ] &&
    [ "$("$executable" --version)" = "$version" ]
}

home=$(cd -P "${HOME:?}" && pwd -P)
uid=$(id -u)
owned_directory "$home" 0022
cache="$home/.meta-sovereign-runner-tools"
if [ "$1" = install ]; then
  mkdir -m 700 "$cache" 2>/dev/null || :
fi
owned_directory "$cache" 0077

name="node-$version-$platform"
destination="$cache/$name-$digest"
if [ ! -e "$destination" ] && [ ! -L "$destination" ] && [ "$1" = install ]; then
  stage=$(mktemp -d "$cache/node-stage-XXXXXXXX")
  trap 'rm -rf "$stage"' EXIT
  trap 'exit 1' HUP INT TERM
  archive="$stage/$name.tar.gz"
  curl --proto '=https' --proto-redir '=https' --fail --silent --location \
    --connect-timeout 10 --max-time 60 --max-filesize 67108864 \
    --output "$archive" "https://nodejs.org/dist/$version/$name.tar.gz"
  case "$platform" in
    linux-*) actual=$(sha256sum "$archive") ;;
    darwin-*) actual=$(shasum -a 256 "$archive") ;;
  esac
  [ "${actual%% *}" = "$digest" ]
  tar -xzf "$archive" --no-same-owner -C "$stage"
  bundle="$stage/$name"
  chmod 700 "$bundle"
  owned_directory "$bundle" 0077
  runtime "$bundle"

  # renameSync publishes exactly one verified directory if cold Starts race.
  "$bundle/bin/node" --input-type=module --eval '
    import { renameSync } from "node:fs";
    try {
      renameSync(process.argv[1], process.argv[2]);
    } catch (error) {
      if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
    }
  ' "$bundle" "$destination"
fi
owned_directory "$destination" 0077
runtime "$destination"
printf '%s\n' "$destination"
