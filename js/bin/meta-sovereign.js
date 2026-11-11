#!/usr/bin/env node
import { runCli } from '../src/cli/index.js';

const code = await runCli(process.argv.slice(2));
// Let pending output finish before the runtime exits.
process.exitCode = code;
