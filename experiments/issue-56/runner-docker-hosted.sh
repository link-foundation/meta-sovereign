#!/usr/bin/env bash
# An owned loopback SSH account exercises the actual remote transport and daemon.
# Logs deliberately belong to the unprivileged CI user, not the sudo command.
# shellcheck disable=SC2024
set -euo pipefail
runner_fixture=$(mktemp -d "${RUNNER_TEMP:?}/runner-docker.XXXXXX")
runner_sshd_pid=
cleanup_runner_fixture() {
  if [[ -n "$runner_sshd_pid" ]]; then
    sudo -n kill -TERM "$runner_sshd_pid" 2>/dev/null || true
    wait "$runner_sshd_pid" || true
  fi
  sudo -n rm -rf -- "$runner_fixture"
}
trap cleanup_runner_fixture EXIT
mkdir -p ci-logs "$runner_fixture/bin"
if [[ ! -x /usr/sbin/sshd ]] || ! command -v screen >/dev/null; then
  sudo -n apt-get update >ci-logs/runner-docker-apt.log 2>&1 &
  runner_install_pid=$!
  wait "$runner_install_pid"
  sudo -n apt-get install --yes --no-install-recommends openssh-server screen >>ci-logs/runner-docker-apt.log 2>&1 &
  runner_install_pid=$!
  wait "$runner_install_pid"
fi
sudo -n mkdir -p /run/sshd
ssh-keygen -q -t ed25519 -N '' -f "$runner_fixture/host"
ssh-keygen -q -t ed25519 -N '' -f "$runner_fixture/client"
runner_port=$(node --input-type=module -e 'import net from "node:net"; const s=net.createServer(); s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')
cat >"$runner_fixture/sshd_config" <<EOF
Port $runner_port
ListenAddress 127.0.0.1
HostKey $runner_fixture/host
PidFile $runner_fixture/sshd.pid
AuthorizedKeysFile $runner_fixture/client.pub
AllowUsers $(id -un)
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
UsePAM yes
StrictModes no
LogLevel ERROR
EOF
cat >"$runner_fixture/ssh_config" <<EOF
Host runner-docker-fixture
  HostName 127.0.0.1
  Port $runner_port
  User $(id -un)
  IdentityFile $runner_fixture/client
  IdentitiesOnly yes
  StrictHostKeyChecking yes
  UserKnownHostsFile $runner_fixture/known_hosts
  GlobalKnownHostsFile /dev/null
  LogLevel ERROR
EOF
awk -v port="$runner_port" '{print "[127.0.0.1]:" port " " $1 " " $2}' "$runner_fixture/host.pub" >"$runner_fixture/known_hosts"
# The fixture adds only an SSH config; production still runs its literal argv.
cat >"$runner_fixture/bin/ssh" <<EOF
#!/usr/bin/env bash
exec /usr/bin/ssh -F '$runner_fixture/ssh_config' "\$@"
EOF
chmod 700 "$runner_fixture/bin/ssh"
sudo -n /usr/sbin/sshd -D -e -f "$runner_fixture/sshd_config" >ci-logs/runner-docker-sshd.log 2>&1 &
runner_sshd_pid=$!
export PATH="$runner_fixture/bin:$PATH"
export RUNNER_DOCKER_FIXTURE="$runner_fixture"
node experiments/issue-56/runner-docker-hosted.mjs
