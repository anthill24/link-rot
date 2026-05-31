import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  normalizeConfig,
  resolveConfig,
  loadConfigFile,
  DEFAULT_CONFIG,
} from '../src/config.js';
import { CONFIG_DIR } from './helpers.js';

describe('normalizeConfig', () => {
  it('accepts a valid config', () => {
    const config = normalizeConfig({
      timeout: 5000,
      retries: 1,
      ignore: ['https://x.com/**'],
      okStatuses: [403, 429],
      offline: true,
    });
    expect(config.timeout).toBe(5000);
    expect(config.ignore).toEqual(['https://x.com/**']);
    expect(config.okStatuses).toEqual([403, 429]);
    expect(config.offline).toBe(true);
  });

  it('rejects non-object input', () => {
    expect(() => normalizeConfig([])).toThrow(/must be a JSON object/);
    expect(() => normalizeConfig(null)).toThrow(/must be a JSON object/);
  });

  it('rejects a non-numeric timeout', () => {
    expect(() => normalizeConfig({ timeout: 'soon' })).toThrow(/timeout/);
  });

  it('rejects negative numbers', () => {
    expect(() => normalizeConfig({ retries: -1 })).toThrow(/retries/);
  });

  it('rejects concurrency below 1 (consistent with the CLI)', () => {
    expect(() => normalizeConfig({ concurrency: 0 })).toThrow(/concurrency/);
  });

  it('rejects a non-string-array ignore list', () => {
    expect(() => normalizeConfig({ ignore: [1, 2] })).toThrow(/ignore/);
  });

  it('rejects non-integer okStatuses', () => {
    expect(() => normalizeConfig({ okStatuses: [403.5] })).toThrow(
      /okStatuses/,
    );
  });

  it('rejects a non-boolean offline flag', () => {
    expect(() => normalizeConfig({ offline: 'yes' })).toThrow(/offline/);
  });
});

describe('resolveConfig', () => {
  it('fills defaults when nothing is provided', () => {
    const config = resolveConfig({}, {}, '/work');
    expect(config.timeout).toBe(DEFAULT_CONFIG.timeout);
    expect(config.concurrency).toBe(DEFAULT_CONFIG.concurrency);
    expect(config.base).toBe('/work');
  });

  it('lets overrides win over the file config', () => {
    const config = resolveConfig(
      { timeout: 1000, retries: 5 },
      { timeout: 2000 },
      '/work',
    );
    expect(config.timeout).toBe(2000);
    expect(config.retries).toBe(5);
  });

  it('ignores undefined overrides', () => {
    const config = resolveConfig(
      { timeout: 1000 },
      { timeout: undefined },
      '/work',
    );
    expect(config.timeout).toBe(1000);
  });

  it('resolves a relative base against cwd', () => {
    const config = resolveConfig({ base: 'docs' }, {}, '/work');
    expect(config.base).toBe('/work/docs');
  });

  it('keeps an absolute base as-is', () => {
    const config = resolveConfig({ base: '/abs/root' }, {}, '/work');
    expect(config.base).toBe('/abs/root');
  });
});

describe('loadConfigFile', () => {
  it('loads and normalizes an explicit config file', async () => {
    const { config, path } = await loadConfigFile(CONFIG_DIR, 'valid.json');
    expect(config.timeout).toBe(5000);
    expect(config.offline).toBe(true);
    expect(path).toBe(join(CONFIG_DIR, 'valid.json'));
  });

  it('returns an empty config when none is found via discovery', async () => {
    const { config, path } = await loadConfigFile('/nonexistent-dir-xyz');
    expect(config).toEqual({});
    expect(path).toBeUndefined();
  });

  it('throws when an explicit config is missing', async () => {
    await expect(
      loadConfigFile(CONFIG_DIR, 'does-not-exist.json'),
    ).rejects.toThrow(/Could not read config/);
  });

  it('throws on invalid JSON', async () => {
    await expect(loadConfigFile(CONFIG_DIR, 'broken.json')).rejects.toThrow(
      /Invalid JSON/,
    );
  });

  it('throws on bad field types', async () => {
    await expect(loadConfigFile(CONFIG_DIR, 'bad-types.json')).rejects.toThrow(
      /timeout/,
    );
  });
});
