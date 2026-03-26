import { templateRegistry } from '@olow/engine';
import type { ITemplate } from '@olow/engine';

// ─── Template Factory ───

export class Templates {
  /** Create a template instance by registered name. App-layer overrides take precedence. */
  static create(name: string, ...args: unknown[]): ITemplate {
    const TemplateClass = templateRegistry.getRegistered().get(name) as
      (new (...args: unknown[]) => ITemplate) | undefined;

    if (!TemplateClass) {
      throw new Error(`Template "${name}" not registered. Import @olow/templates or register it manually.`);
    }

    return new TemplateClass(...args);
  }
}
