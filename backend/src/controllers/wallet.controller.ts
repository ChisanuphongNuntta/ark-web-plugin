import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import walletService from '../services/wallet.service.js';

export class WalletController {
  getBalance = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      res.json(await walletService.getBalance(req.user!.id));
    } catch (error) { next(error); }
  };

  getHistory = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const page = Number(req.query.page || 1);
      const limit = Number(req.query.limit || 20);
      res.json(await walletService.getHistory(req.user!.id, page, limit));
    } catch (error) { next(error); }
  };
}

export default new WalletController();
