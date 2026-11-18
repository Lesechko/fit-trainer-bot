/**
 * Classify /start payload for the shared @MarGoTraining_bot.
 * Course paths (site-/paid-/instagram-/access code) stay separate from platform member soft-landing.
 */
export type StartRoute =
  | { kind: 'ask_code' }
  | { kind: 'member' }
  | { kind: 'paid'; slug: string }
  | { kind: 'site'; slug: string }
  | { kind: 'instagram'; slug: string }
  | { kind: 'access_code'; code: string };

export function resolveStartRoute(param: string | null): StartRoute {
  if (!param) {
    return { kind: 'ask_code' };
  }

  if (param === 'member') {
    return { kind: 'member' };
  }

  if (param.startsWith('paid-')) {
    const slug = param.slice('paid-'.length);
    if (slug) {
      return { kind: 'paid', slug };
    }
  }

  if (param.startsWith('site-')) {
    const slug = param.slice('site-'.length);
    if (slug) {
      return { kind: 'site', slug };
    }
  }

  if (param.startsWith('instagram-')) {
    const slug = param.slice('instagram-'.length);
    if (slug) {
      return { kind: 'instagram', slug };
    }
  }

  return { kind: 'access_code', code: param };
}
