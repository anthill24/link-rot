/**
 * Minimal zero-dependency ANSI colorizer. Honors the NO_COLOR convention and
 * can be toggled explicitly; otherwise enabled only when stdout is a TTY.
 */

const CODES = {
  reset: '[0m',
  bold: '[1m',
  dim: '[2m',
  red: '[31m',
  green: '[32m',
  yellow: '[33m',
  cyan: '[36m',
} as const;

type Style = Exclude<keyof typeof CODES, 'reset'>;

export interface Colorizer {
  enabled: boolean;
  (style: Style, text: string | number): string;
}

export function createColorizer(enabled: boolean): Colorizer {
  const fn = ((style: Style, text: string | number): string =>
    enabled
      ? `${CODES[style]}${text}${CODES.reset}`
      : String(text)) as Colorizer;
  fn.enabled = enabled;
  return fn;
}

/**
 * Decide whether color should be used given an explicit override, the NO_COLOR
 * / FORCE_COLOR environment variables, and whether the stream is a TTY.
 */
export function shouldUseColor(
  override: boolean | undefined,
  env: NodeJS.ProcessEnv,
  isTTY: boolean,
): boolean {
  if (override !== undefined) return override;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '') return true;
  return isTTY;
}
