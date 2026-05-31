#!/usr/bin/env node
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { run, EXIT_USAGE } from './run.js';

run(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  isTTY: Boolean(process.stdout.isTTY),
  write: (text) => process.stdout.write(text),
  writeErr: (text) => process.stderr.write(text),
  readStdin: () => readFileSync(0, 'utf8'),
})
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? (err.stack ?? err.message) : err;
    process.stderr.write(`link-rot: unexpected error\n${message}\n`);
    process.exitCode = EXIT_USAGE;
  });
