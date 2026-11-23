#!/usr/bin/env bash
# Exercise both native Screen baselines and keep separate hosted diagnostics.
set -euo pipefail
mkdir -p ci-logs
node experiments/issue-56/runner-node-local.mjs 2>&1 | tee ci-logs/runner-docker-private-node.log
node experiments/issue-56/runner-node-local.mjs --node-on-path 2>&1 | tee ci-logs/runner-docker-private-npm.log
