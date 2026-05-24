// E2.10: Core Help Assistant router.
// Routes: GET /articles, GET /articles/:id, GET /tooltip/:moduleId, POST /chat
// productKey resolved from x-product-key header → query param → first registered product.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireTenant } from '../../middleware/auth.middleware.js';
import {
  listArticles,
  getArticle,
  getHelpTooltips,
  handleHelpChat,
} from './help.service.js';
import type { HelpChatRequest } from '@wings2i-gracie/contracts';

const router = Router();

router.use(requireAuth, requireTenant);

function resolveProductKey(req: Request): string {
  return (
    (req.headers['x-product-key'] as string | undefined) ??
    (req.query.productKey as string | undefined) ??
    'privacy'
  );
}

// GET /api/v1/core/help/articles?moduleKey=
router.get('/articles', (req: Request, res: Response, next: NextFunction) => {
  try {
    const productKey = resolveProductKey(req);
    const moduleKey = req.query.moduleKey as string | undefined;
    const articles = listArticles(productKey, moduleKey);
    res.json(articles);
  } catch (err) { next(err); }
});

// GET /api/v1/core/help/articles/:id
router.get('/articles/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const productKey = resolveProductKey(req);
    const article = getArticle(productKey, req.params.id as string);
    if (!article) {
      res.status(404).json({ success: false, error: 'Article not found' });
      return;
    }
    res.json({ content: article.content });
  } catch (err) { next(err); }
});

// GET /api/v1/core/help/tooltip/:moduleId
router.get('/tooltip/:moduleId', (req: Request, res: Response, next: NextFunction) => {
  try {
    const productKey = resolveProductKey(req);
    const tooltips = getHelpTooltips(productKey, req.params.moduleId as string);
    res.json({ tooltips });
  } catch (err) { next(err); }
});

// POST /api/v1/core/help/chat — SSE stream wrapping handleHelpChat
router.post('/chat', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (obj: Record<string, unknown>) =>
    res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const tenantId = req.user!.tenantId!;
    const productKey = resolveProductKey(req);

    // Accept both moduleKey (new) and moduleId (legacy Privacy client)
    const chatReq: HelpChatRequest = {
      moduleKey: (req.body.moduleKey ?? req.body.moduleId ?? 'general') as string,
      currentRoute: (req.body.currentRoute ?? '/') as string,
      messages: req.body.messages ?? [],
      userRole: req.body.userRole,
      featureFlags: req.body.featureFlags,
    };

    const result = await handleHelpChat(tenantId, productKey, chatReq);
    send({ delta: result.reply });
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: unknown) {
    console.error('[CoreHelp] chat error:', err);
    send({ error: 'AI help temporarily unavailable' });
    res.end();
  }
});

export default router;
