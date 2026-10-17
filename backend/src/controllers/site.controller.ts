import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import siteSettingsService, { parseUpdateSiteSettings } from '../services/siteSettings.service.js';
import auditService from '../services/audit.service.js';

export class SiteController {
  // GET /site/settings (public) -> { season, activeSeason, announcement }
  getSettings = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json(await siteSettingsService.get());
    } catch (error) {
      next(error);
    }
  };

  // PUT /admin/site/settings (admin|root) body { season?, announcement? } -> same shape as GET.
  updateSettings = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const input = parseUpdateSiteSettings(req.body);
      const { before, after } = await siteSettingsService.update(input, req.user!.id);
      await auditService.log({
        userId: req.user!.id,
        action: 'site_settings_update',
        resource: 'site_settings',
        oldValue: { season: before.season, announcement: before.announcement },
        newValue: { season: after.season, announcement: after.announcement },
      }, req);
      res.json(after);
    } catch (error) {
      next(error);
    }
  };
}

export const siteController = new SiteController();
export default siteController;
