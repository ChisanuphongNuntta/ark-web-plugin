import { Router } from 'express';
import { ContentController } from '../controllers/content.controller.js';
import { authenticate, requireAdmin, optionalAuthenticate } from '../middlewares/auth.js';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const router = Router();
const contentController = new ContentController();
const uploadRoot = path.resolve(process.cwd(), 'public', 'uploads');

const safeFolder = (value: unknown): string => {
  const folder = typeof value === 'string' && value.length > 0 ? value : 'uploads';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(folder)) {
    throw new Error('Invalid upload folder');
  }
  return folder;
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let folder: string;
    try {
      folder = safeFolder(req.body.folder);
    } catch (error) {
      return cb(error as Error, '');
    }
    const uploadPath = path.resolve(uploadRoot, folder);
    if (!uploadPath.startsWith(`${uploadRoot}${path.sep}`)) {
      return cb(new Error('Invalid upload path'), '');
    }
    (req as any).uploadFolder = folder;

    // Create directory if not exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
    };
    const ext = extensions[file.mimetype];
    if (!ext) return cb(new Error('Invalid file type'), '');
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

const fileFilter = (req: any, file: any, cb: any) => {
  // Allowed file types
  const allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});

// ==========================================
// Public Routes
// ==========================================

// Get block types (for reference)
router.get('/block-types', contentController.getBlockTypes);

// Get all published pages
router.get('/pages', contentController.getPublicPages);

// Get published page by slug
router.get('/pages/slug/:slug', contentController.getPublicPageBySlug);

// ==========================================
// Admin Routes
// ==========================================

// Admin middleware for all routes below
const adminAuth = [authenticate as any, requireAdmin];

// --- Pages ---
router.get('/admin/pages', ...adminAuth, contentController.getAllPages as any);
router.get('/admin/pages/:id', ...adminAuth, contentController.getPageById as any);
router.post('/admin/pages', ...adminAuth, contentController.createPage as any);
router.put('/admin/pages/:id', ...adminAuth, contentController.updatePage as any);
router.delete('/admin/pages/:id', ...adminAuth, contentController.deletePage as any);
router.post('/admin/pages/:id/duplicate', ...adminAuth, contentController.duplicatePage as any);

// --- Blocks ---
router.get('/admin/pages/:pageId/blocks', ...adminAuth, contentController.getBlocks as any);
router.post('/admin/pages/:pageId/blocks', ...adminAuth, contentController.createBlock as any);
router.put('/admin/blocks/:blockId', ...adminAuth, contentController.updateBlock as any);
router.delete('/admin/blocks/:blockId', ...adminAuth, contentController.deleteBlock as any);
router.post('/admin/pages/:pageId/blocks/reorder', ...adminAuth, contentController.reorderBlocks as any);

// --- Media ---
router.get('/admin/media', ...adminAuth, contentController.getMediaFiles as any);
router.get('/admin/media/folders', ...adminAuth, contentController.getFolders as any);
router.post('/admin/media/upload', ...adminAuth, upload.single('file'), contentController.uploadMedia as any);
router.put('/admin/media/:id', ...adminAuth, contentController.updateMedia as any);
router.delete('/admin/media/:id', ...adminAuth, contentController.deleteMedia as any);

export default router;
