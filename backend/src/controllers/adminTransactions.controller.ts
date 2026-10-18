// Admin transactions + ledger reconciliation endpoints
// (backend/contracts/admin-transactions-2026-10.md). Route guards live in routes/admin.routes.ts.
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth.js';
import auditService from '../services/audit.service.js';
import {
  EXPORT_MAX_ROWS,
  exportTransactionsCsv,
  getDailySummary,
  getTransactionDetail,
  listTransactions,
  parseTransactionFilters,
} from '../services/adminTransactions.service.js';
import { reconcileLedger } from '../services/ledgerReconcile.service.js';

function filtersForAudit(filters: ReturnType<typeof parseTransactionFilters>) {
  return {
    ...filters,
    from: filters.from?.toISOString(),
    to: filters.to?.toISOString(),
  };
}

export class AdminTransactionsController {
  // GET /admin/transactions
  list = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      res.json(await listTransactions(req.query as Record<string, unknown>));
    } catch (error) {
      next(error);
    }
  };

  // GET /admin/transactions/summary?date=YYYY-MM-DD
  summary = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      res.json(await getDailySummary(req.query as Record<string, unknown>));
    } catch (error) {
      next(error);
    }
  };

  // GET /admin/transactions/:id
  detail = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      res.json(await getTransactionDetail(req.params.id));
    } catch (error) {
      next(error);
    }
  };

  // GET /admin/transactions/export.csv — streamed, UTF-8 BOM, max 50k rows, audited.
  exportCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
    let filters: ReturnType<typeof parseTransactionFilters>;
    try {
      filters = parseTransactionFilters(req.query as Record<string, unknown>);
    } catch (error) {
      return next(error);
    }

    const state = { rows: 0, truncated: false };
    const startedAt = new Date();
    const stamp = startedAt.toISOString().slice(0, 16).replace(/[-:T]/g, '');
    let aborted = false;
    req.on?.('close', () => {
      if (!res.writableEnded) aborted = true;
    });

    try {
      res.status(200);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="iris-transactions-${stamp}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Export-Max-Rows', String(EXPORT_MAX_ROWS));

      for await (const chunk of exportTransactionsCsv(filters, state, { now: startedAt })) {
        if (aborted) break;
        if (!res.write(chunk)) {
          await new Promise<void>((resolve) => {
            const done = () => {
              res.off?.('drain', done);
              res.off?.('close', done);
              resolve();
            };
            res.once('drain', done);
            res.once('close', done);
          });
        }
      }
      res.end();

      await auditService.log({
        userId: req.user!.id,
        action: 'transactions_export',
        resource: 'ledger',
        newValue: { rows: state.rows, truncated: state.truncated, aborted },
        metadata: { filters: filtersForAudit(filters), maxRows: EXPORT_MAX_ROWS },
      }, req);
    } catch (error) {
      await auditService.log({
        userId: req.user?.id,
        action: 'transactions_export',
        resource: 'ledger',
        status: 'failure',
        errorMessage: error instanceof Error ? error.message : String(error),
        metadata: { filters: filtersForAudit(filters), rows: state.rows },
      }, req);
      if (res.headersSent) {
        // Mid-stream failure: the CSV is incomplete — cut the connection rather than end it
        // cleanly so the download is reported as failed.
        res.destroy?.(error instanceof Error ? error : undefined);
        return;
      }
      next(error);
    }
  };

  // GET /admin/ledger/reconcile (root)
  reconcile = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await reconcileLedger();
      await auditService.log({
        userId: req.user!.id,
        action: 'ledger_reconcile',
        resource: 'ledger',
        status: result.ok ? 'success' : 'failure',
        newValue: {
          ok: result.ok,
          checkedAccounts: result.checkedAccounts,
          mismatchCount: result.mismatchCount,
          legacyPointsMismatchCount: result.legacyPointsMismatchCount,
          unbalancedTransactionCount: result.unbalancedTransactionCount,
        },
      }, req);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}

export default new AdminTransactionsController();
