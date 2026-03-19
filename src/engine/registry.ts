import { readdir } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { config } from '../config/index.js';
import type { SpaceType } from './types.js';
import logger from './logger.js';

// ─── Module Registry ───

type Constructor = new (...args: unknown[]) => unknown;

class ModuleRegistry {
  private registry = new Map<string, unknown>();

  register(opts?: { name?: string; restrictedSpaces?: SpaceType[] }) {
    return <T extends Constructor>(target: T): T => {
      const name = opts?.name ?? target.name;
      if (!opts?.restrictedSpaces || opts.restrictedSpaces.includes(config.space)) {
        this.registry.set(name, target);
      }
      return target;
    };
  }

  /**
   * Recursively discover and import all modules in a directory.
   * Each module's side-effects (e.g. `registerFlow()`) run on import.
   * Skips files starting with "base." or "Base", and test files.
   */
  async discoverModules(dir: string): Promise<void> {
    const absDir = resolve(dir);
    try {
      const entries = await readdir(absDir, { withFileTypes: true, recursive: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const ext = extname(entry.name);
        if (ext !== '.ts' && ext !== '.js') continue;
        if (entry.name.startsWith('base.') || entry.name.startsWith('Base')) continue;
        if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.js')) continue;

        const fullPath = join(entry.parentPath ?? entry.path, entry.name);
        try {
          // Use file:// URL for cross-platform dynamic import
          await import(pathToFileURL(fullPath).href);
        } catch (err) {
          logger.error({ msg: `Failed to import module ${fullPath}`, err });
        }
      }
    } catch (err) {
      logger.error({ msg: `Failed to discover modules in ${dir}`, err });
    }
  }

  getRegistered<T>(baseClass?: new (...args: unknown[]) => T): Map<string, T> {
    if (!baseClass) {
      return this.registry as Map<string, T>;
    }
    const result = new Map<string, T>();
    for (const [name, item] of this.registry) {
      if (typeof item === 'function' && item.prototype instanceof baseClass) {
        result.set(name, item as T);
      }
    }
    return result;
  }

  add(name: string, item: unknown): void {
    this.registry.set(name, item);
  }

  cleanRegistry(): void {
    this.registry.clear();
  }
}

export const registry = new ModuleRegistry();
