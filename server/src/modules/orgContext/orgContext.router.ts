import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireTenant } from '../../middleware/auth.middleware.js';
import {
  getOrgProfile,
  upsertOrgProfile,
  getDpoDetails,
  upsertDpoDetails,
  listFunctions,
  createFunction,
  updateFunction,
  deactivateFunction,
  listLocations,
  getLocationsByFunction,
  createLocation,
  updateLocation,
  deactivateLocation,
  listEntities,
  createEntity,
  updateEntity,
  deactivateEntity,
  listStakeholders,
  createStakeholder,
  updateStakeholder,
  removeStakeholder,
  registerOrgRoleType,
  getRoleAssignment,
  upsertRoleAssignment,
} from './orgContext.service.js';

const router = Router();

router.use(requireAuth, requireTenant);

// ── Org profile ───────────────────────────────────────────────────────────────

router.get('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getOrgProfile(req.user!.tenantId!);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await upsertOrgProfile(req.user!.tenantId!, req.user!.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── DPO ───────────────────────────────────────────────────────────────────────

router.get('/dpo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getDpoDetails(req.user!.tenantId!);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/dpo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await upsertDpoDetails(req.user!.tenantId!, req.user!.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Functions ─────────────────────────────────────────────────────────────────

router.get('/functions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listFunctions(req.user!.tenantId!);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/functions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await createFunction(req.user!.tenantId!, req.user!.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/functions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await updateFunction(req.user!.tenantId!, req.params.id as string, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/functions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deactivateFunction(req.user!.tenantId!, req.params.id as string);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Locations ─────────────────────────────────────────────────────────────────

router.get('/locations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listLocations(req.user!.tenantId!);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/locations-by-function/:functionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getLocationsByFunction(req.user!.tenantId!, req.params.functionId as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/locations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await createLocation(req.user!.tenantId!, req.user!.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/locations/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await updateLocation(req.user!.tenantId!, req.params.id as string, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/locations/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deactivateLocation(req.user!.tenantId!, req.params.id as string);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Entities ──────────────────────────────────────────────────────────────────

router.get('/entities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listEntities(req.user!.tenantId!);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/entities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await createEntity(req.user!.tenantId!, req.user!.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/entities/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await updateEntity(req.user!.tenantId!, req.params.id as string, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/entities/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deactivateEntity(req.user!.tenantId!, req.params.id as string);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Stakeholders ──────────────────────────────────────────────────────────────

router.get('/stakeholders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listStakeholders(req.user!.tenantId!);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/stakeholders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await createStakeholder(req.user!.tenantId!, req.user!.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/stakeholders/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await updateStakeholder(req.user!.tenantId!, req.params.id as string, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/stakeholders/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await removeStakeholder(req.user!.tenantId!, req.params.id as string);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Role type registry ────────────────────────────────────────────────────────

router.get('/role-types/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getRoleAssignment(req.user!.tenantId!, req.params.key as string);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/role-types/:key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await upsertRoleAssignment(req.user!.tenantId!, req.params.key as string, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/role-types/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { key, label } = req.body as { key: string; label: string };
    const data = await registerOrgRoleType(key, label);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
