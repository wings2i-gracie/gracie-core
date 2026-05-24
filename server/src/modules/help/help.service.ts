// E2.10: Help Assistant engine.
//
// Products call registerHelpProduct() on startup to load their KB articles and route map
// into the in-memory registry. The router serves articles and chat from this registry.
// No DB table — conversations are stateless; only AI usage is logged via the AI service.

import { aiComplete } from '../ai/ai.service.js';
import type {
  HelpArticle,
  HelpRegistration,
  HelpChatRequest,
  HelpChatResponse,
} from '@wings2i-gracie/contracts';

// ── In-memory product registry ────────────────────────────────────────────────

const productRegistry = new Map<string, HelpRegistration>();

export function registerHelpProduct(registration: HelpRegistration): void {
  productRegistry.set(registration.productKey, registration);
}

// ── Article access ────────────────────────────────────────────────────────────

export function resolveArticle(productKey: string, currentRoute: string): HelpArticle | null {
  const reg = productRegistry.get(productKey);
  if (!reg) return null;
  let bestId: string | null = null;
  let bestLen = 0;
  for (const [pattern, articleId] of Object.entries(reg.routeMap)) {
    if (currentRoute.startsWith(pattern) && pattern.length > bestLen) {
      bestId = articleId;
      bestLen = pattern.length;
    }
  }
  if (!bestId) return null;
  return reg.articles.find((a) => a.id === bestId) ?? null;
}

export function listArticles(productKey: string, moduleKey?: string): HelpArticle[] {
  const reg = productRegistry.get(productKey);
  if (!reg) return [];
  if (moduleKey) return reg.articles.filter((a) => a.moduleKey === moduleKey);
  return reg.articles;
}

export function getArticle(productKey: string, articleId: string): HelpArticle | null {
  const reg = productRegistry.get(productKey);
  if (!reg) return null;
  return reg.articles.find((a) => a.id === articleId) ?? null;
}

export function getHelpTooltips(
  productKey: string,
  moduleKey: string,
): Record<string, string> {
  const reg = productRegistry.get(productKey);
  if (!reg?.tooltips) return {};
  return reg.tooltips[moduleKey] ?? {};
}

// ── System prompt builder ─────────────────────────────────────────────────────

function buildHelpSystemPrompt(
  reg: HelpRegistration,
  moduleKey: string,
  userRole: string,
  featureFlags: Record<string, boolean>,
): string {
  const layers: string[] = [];

  // Layer 1: core overview article
  const coreArticle = reg.articles.find((a) => a.moduleKey === 'core');
  if (coreArticle) layers.push(coreArticle.content);

  // Layer 2: module-specific article (budget ~8000 chars)
  const moduleArticle = reg.articles.find((a) => a.moduleKey === moduleKey);
  if (moduleArticle) layers.push(moduleArticle.content.slice(0, 8000));

  // Layer 3: role article (id pattern: role:{roleId})
  const roleArticle = reg.articles.find(
    (a) => a.id === `role:${userRole}` || (a.moduleKey === 'role' && a.tags?.includes(userRole)),
  );
  if (roleArticle) layers.push(roleArticle.content);

  layers.push(
    `You are helping a ${userRole}. Explain only what is relevant to their role. Do not describe actions they cannot perform.`,
  );

  // Layer 4: inactive features
  const inactiveFlags = Object.entries(featureFlags)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (inactiveFlags.length > 0) {
    layers.push(
      `The following features are NOT active for this tenant and must not be mentioned: ${inactiveFlags.join(', ')}.`,
    );
  }

  // Layer 5: product personality fragment
  layers.push(reg.systemPromptFragment);

  return layers.join('\n\n---\n\n');
}

// ── Chat completion ───────────────────────────────────────────────────────────

export async function handleHelpChat(
  tenantId: string,
  productKey: string,
  req: HelpChatRequest,
): Promise<HelpChatResponse> {
  const reg = productRegistry.get(productKey);
  if (!reg) {
    throw Object.assign(new Error(`Help product '${productKey}' not registered`), {
      code: 'PRODUCT_NOT_REGISTERED',
      status: 503,
    });
  }

  const moduleKey = req.moduleKey ?? 'general';
  const userRole = req.userRole ?? 'viewer';
  const featureFlags = req.featureFlags ?? {};

  const systemPrompt = buildHelpSystemPrompt(reg, moduleKey, userRole, featureFlags);
  const history = (req.messages ?? []).slice(-6);

  const result = await aiComplete({
    tenantId,
    feature: 'help_chat',
    systemPrompt,
    messages: history,
    maxTokens: 1024,
  });

  return { reply: result.content };
}
