import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const FIXTURES = join(here, 'fixtures');
export const PROJECT_DIR = join(FIXTURES, 'project');
export const ONLINE_DIR = join(FIXTURES, 'online');
export const CONFIG_DIR = join(FIXTURES, 'config');

export function fixture(...segments: string[]): string {
  return join(FIXTURES, ...segments);
}

/** A captured-IO harness for driving the CLI `run()` in tests. */
export interface CapturedIO {
  out: string;
  err: string;
  io: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    isTTY: boolean;
    write: (text: string) => void;
    writeErr: (text: string) => void;
    readStdin?: () => string;
  };
}

export function captureIO(
  cwd: string,
  env: NodeJS.ProcessEnv = {},
  stdin?: string,
): CapturedIO {
  const captured: CapturedIO = {
    out: '',
    err: '',
    io: {
      cwd,
      env,
      isTTY: false,
      write: (text) => {
        captured.out += text;
      },
      writeErr: (text) => {
        captured.err += text;
      },
      readStdin: stdin === undefined ? undefined : () => stdin,
    },
  };
  return captured;
}
