"""Run a private runner fixture over real loopback SSH without installing sshd.

Requires the Paramiko wheel in the selected Python environment and OpenSSH client.
The peer accepts one ephemeral key, no forwarding, and only the runner's stdin
shell command. The hosted fixture exercises OpenSSH server independently.
"""
from pathlib import Path
from shlex import quote
from socketserver import BaseRequestHandler, TCPServer
from tempfile import TemporaryDirectory
from threading import Event, Thread
import os
import subprocess
import sys

import paramiko


class RunnerPeer(paramiko.ServerInterface):
    def __init__(self, client_key):
        self.client_key = client_key
        self.command_ready = Event()

    def get_allowed_auths(self, username):
        return 'publickey'

    def check_auth_publickey(self, username, key):
        if username == 'runner-fixture' and key == self.client_key:
            return paramiko.AUTH_SUCCESSFUL
        return paramiko.AUTH_FAILED

    def check_channel_request(self, kind, channel_id):
        if kind == 'session':
            return paramiko.OPEN_SUCCEEDED
        return paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED

    def check_channel_exec_request(self, channel, command):
        if command != b'sh -s' or self.command_ready.is_set():
            return False
        self.command_ready.set()
        return True


class RunnerShell(BaseRequestHandler):
    def handle(self):
        connection = paramiko.Transport(self.request)
        try:
            peer = RunnerPeer(self.server.client_key)
            connection.add_server_key(self.server.host_key)
            connection.start_server(server=peer)
            channel = connection.accept(10)
            if channel is None or not peer.command_ready.wait(10):
                return
            channel.settimeout(10)
            payload = channel.makefile('rb').read(65537)
            if len(payload) > 65536:
                channel.send_exit_status(1)
                return
            reply = subprocess.run(['/bin/sh', '-s'], input=payload,
                                   capture_output=True, check=False, timeout=110)
            channel.sendall(reply.stdout)
            channel.sendall_stderr(reply.stderr)
            channel.send_exit_status(reply.returncode)
            channel.shutdown_write()
            channel.close()
            # Let OpenSSH finish its protocol disconnect before closing TCP.
            connection.join(2)
        finally:
            connection.close()


def make_key(directory, name):
    path = directory / name
    subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f', path],
                   check=True)
    return paramiko.Ed25519Key.from_private_key_file(str(path))


with TemporaryDirectory(prefix='ms-runner-node-ssh-') as directory:
    root = Path(directory)
    with TCPServer(('127.0.0.1', 0), RunnerShell) as server:
        server.host_key = make_key(root, 'host')
        server.client_key = make_key(root, 'client')
        address, port = server.server_address
        known_hosts = root / 'known_hosts'
        known_hosts.write_text(
            f'[{address}]:{port} {server.host_key.get_name()} {server.host_key.get_base64()}\n')
        config = root / 'ssh_config'
        config.write_text(
            f'Host runner-node-loopback\n  HostName {address}\n  Port {port}\n'
            f'  User runner-fixture\n  IdentityFile {root / "client"}\n'
            '  IdentitiesOnly yes\n  StrictHostKeyChecking yes\n'
            f'  UserKnownHostsFile {known_hosts}\n  GlobalKnownHostsFile /dev/null\n')
        client = root / 'ssh'
        client.write_text(f'#!/bin/sh\nexec /usr/bin/ssh -F {quote(str(config))} "$@"\n')
        client.chmod(0o700)
        listener = Thread(target=server.serve_forever)
        listener.start()
        try:
            variants = {
                '--image': ('runner-image-native', 'RUNNER_IMAGE_PROBE_SSH_HOST'),
                '--graph': ('runner-graph-native', 'RUNNER_GRAPH_SSH_HOST'),
                '--application': ('runner-application-native', 'RUNNER_APPLICATION_SSH_HOST'),
                '--source': ('runner-deployment-native', 'RUNNER_SOURCE_SSH_HOST'),
            }
            arguments = sys.argv[1:]
            variant = variants.get(arguments[0]) if len(arguments) == 1 else None
            script, host_env = variant or ('runner-node-local', 'RUNNER_PRIVATE_NODE_HOST')
            if variant:
                arguments = []
            subprocess.run(['node', f'experiments/issue-56/{script}.mjs', *arguments],
                           env={**os.environ, 'PATH': f'{root}:{os.environ["PATH"]}',
                                host_env: 'runner-node-loopback'},
                           check=True)
        finally:
            server.shutdown()
            listener.join()
