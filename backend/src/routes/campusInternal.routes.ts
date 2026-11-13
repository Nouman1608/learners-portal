import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import usersService from '../services/users.service';
import { otherCampus } from '../services/otherCampus.service';
import { AppError } from '../middleware/errorHandler';

/*
 * /api/internal/campus — called only by the other campus portal's backend (never by a
 * browser), for siblings who study in different campuses. Each request must carry a pass
 * signed with the secret the two portals share (see services/otherCampus.service.ts).
 */
const router = Router();

router.use((req: Request, _res: Response, next: NextFunction) => {
  if (!otherCampus.accepts(req.headers['x-campus-pass'])) return next(new AppError(401, 'Not allowed'));
  next();
});

const uuid = z.string().uuid();
const phoneKeys = z.string().regex(/^\d{7,10}(,\d{7,10})*$/).optional();

// Students here: all of them (sibling picker), or those matching phone numbers (suggestions)
router.get('/students', async (req, res) => {
  const keys = phoneKeys.parse(req.query.phoneKeys);
  res.json({ students: await usersService.studentsForOtherCampus(keys?.split(',')) });
});

router.get('/students/:id', async (req, res) => {
  const { id, username, firstName, lastName, phone, parentPhone, isActive, familyId } =
    await usersService.requireStudent(uuid.parse(req.params.id));
  res.json({ student: { id, username, firstName, lastName, phone, parentPhone, isActive, familyId } });
});

router.get('/families/:familyId/members', async (req, res) => {
  res.json({ students: await usersService.familyMembersForOtherCampus(uuid.parse(req.params.familyId)) });
});

// Put one of our students into a family (null takes them out)
router.post('/students/:id/family', async (req, res) => {
  const { familyId } = z.object({ familyId: uuid.nullable() }).parse(req.body);
  res.json(await usersService.setFamilyFromOtherCampus(uuid.parse(req.params.id), familyId));
});

export default router;
