import { Router } from 'express';
import { ContentController } from '../controllers/content.controller.js';
import { authenticate, requireAdmin, optionalAuthenticate } from '../middlewares/auth.js';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const router = Router();
const contentController = new ContentController();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.body.folder || 'uploads';
    const uploadPath = path.join(process.cwd(), 'public', 'uploads', folder);

    // Create directory if not exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

const fileFilter = (req: any, file: any, cb: any) => {
  // Allowed file types
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'video/mp4',
    'video/webm',
    'application/pdf',
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
