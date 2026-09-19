import { Request, Response, NextFunction } from 'express';
import { unlink } from 'fs/promises';
import path from 'path';
import prisma from '../config/database.js';
import { AppError } from '../middlewares/errorHandler.js';
import { AuthRequest } from '../middlewares/auth.js';

export class ContentController {
  // ==========================================
  // Dynamic Pages
  // ==========================================

  // Get all pages (public - only published)
  getPublicPages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pages = await prisma.dynamicPage.findMany({
        where: { isPublished: true },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          pageType: true,
          metaTitle: true,
          metaDescription: true,
          ogImage: true,
        },
      });

      res.json({ pages });
    } catch (error) {
      next(error);
    }
  };

  // Get public page by slug
  getPublicPageBySlug = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { slug } = req.params;

      const page = await prisma.dynamicPage.findUnique({
        where: { slug },
        include: {
          blocks: {
            where: { isVisible: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!page || !page.isPublished) {
        throw new AppError('Page not found', 404);
      }

      // Parse JSON content for blocks
      const pageWithParsedBlocks = {
        ...page,
        settings: page.settings ? JSON.parse(page.settings) : null,
        blocks: page.blocks.map(block => ({
          ...block,
          content: JSON.parse(block.content),
          settings: block.settings ? JSON.parse(block.settings) : null,
        })),
      };

      res.json({ page: pageWithParsedBlocks });
    } catch (error) {
      next(error);
    }
  };

  // Get all pages (admin)
  getAllPages = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { pageType, search, page = '1', limit = '20' } = req.query;

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = {};

      if (pageType) {
        where.pageType = pageType;
      }

      if (search) {
        where.OR = [
          { title: { contains: search as string, mode: 'insensitive' } },
          { slug: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const [pages, total] = await Promise.all([
        prisma.dynamicPage.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip,
          take: parseInt(limit as string),
          include: {
            _count: {
              select: { blocks: true },
            },
          },
        }),
        prisma.dynamicPage.count({ where }),
      ]);

      res.json({
        pages: pages.map(p => ({
          ...p,
          settings: p.settings ? JSON.parse(p.settings) : null,
        })),
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Get page by ID (admin)
  getPageById = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const page = await prisma.dynamicPage.findUnique({
        where: { id: parseInt(id) },
        include: {
          blocks: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!page) {
        throw new AppError('Page not found', 404);
      }

      // Parse JSON content
      const pageWithParsedBlocks = {
        ...page,
        settings: page.settings ? JSON.parse(page.settings) : null,
        blocks: page.blocks.map(block => ({
          ...block,
          content: JSON.parse(block.content),
          settings: block.settings ? JSON.parse(block.settings) : null,
        })),
      };

      res.json({ page: pageWithParsedBlocks });
    } catch (error) {
      next(error);
    }
  };

  // Create page
  createPage = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const {
        slug,
        title,
        description,
        pageType = 'custom',
        metaTitle,
        metaDescription,
        ogImage,
        layout = 'default',
        settings,
      } = req.body;

      // Validate slug
      if (!slug || !title) {
        throw new AppError('Slug and title are required', 400);
      }

      // Check slug uniqueness
      const existingPage = await prisma.dynamicPage.findUnique({
        where: { slug },
      });

      if (existingPage) {
        throw new AppError('Slug already exists', 400);
      }

      const page = await prisma.dynamicPage.create({
        data: {
          slug,
          title,
          description,
          pageType,
          metaTitle,
          metaDescription,
          ogImage,
          layout,
          settings: settings ? JSON.stringify(settings) : null,
          createdBy: req.user?.id,
        },
      });

      res.status(201).json({
        message: 'Page created successfully',
        page: {
          ...page,
          settings: page.settings ? JSON.parse(page.settings) : null,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Update page
  updatePage = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const {
        slug,
        title,
        description,
        pageType,
        isPublished,
        metaTitle,
        metaDescription,
        ogImage,
        layout,
        settings,
      } = req.body;

      const existingPage = await prisma.dynamicPage.findUnique({
        where: { id: parseInt(id) },
      });

      if (!existingPage) {
        throw new AppError('Page not found', 404);
      }

      // Check slug uniqueness if changed
      if (slug && slug !== existingPage.slug) {
        const slugExists = await prisma.dynamicPage.findUnique({
          where: { slug },
        });
        if (slugExists) {
          throw new AppError('Slug already exists', 400);
        }
      }

      const updateData: any = {};
      if (slug !== undefined) updateData.slug = slug;
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (pageType !== undefined) updateData.pageType = pageType;
      if (metaTitle !== undefined) updateData.metaTitle = metaTitle;
      if (metaDescription !== undefined) updateData.metaDescription = metaDescription;
      if (ogImage !== undefined) updateData.ogImage = ogImage;
      if (layout !== undefined) updateData.layout = layout;
      if (settings !== undefined) updateData.settings = JSON.stringify(settings);

      // Handle publish/unpublish
      if (isPublished !== undefined) {
        updateData.isPublished = isPublished;
        if (isPublished && !existingPage.publishedAt) {
          updateData.publishedAt = new Date();
        }
      }

      const page = await prisma.dynamicPage.update({
        where: { id: parseInt(id) },
        data: updateData,
      });

      res.json({
        message: 'Page updated successfully',
        page: {
          ...page,
          settings: page.settings ? JSON.parse(page.settings) : null,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Delete page
  deletePage = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const page = await prisma.dynamicPage.findUnique({
        where: { id: parseInt(id) },
      });

      if (!page) {
        throw new AppError('Page not found', 404);
      }

      // Delete page (blocks will cascade delete)
      await prisma.dynamicPage.delete({
        where: { id: parseInt(id) },
      });

      res.json({ message: 'Page deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

  // Duplicate page
  duplicatePage = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { newSlug, newTitle } = req.body;

      const originalPage = await prisma.dynamicPage.findUnique({
        where: { id: parseInt(id) },
        include: {
          blocks: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      });

      if (!originalPage) {
        throw new AppError('Page not found', 404);
      }

      // Generate new slug if not provided
      const slug = newSlug || `${originalPage.slug}-copy`;
      const title = newTitle || `${originalPage.title} (Copy)`;

      // Check slug uniqueness
      const existingPage = await prisma.dynamicPage.findUnique({
        where: { slug },
      });

      if (existingPage) {
        throw new AppError('Slug already exists', 400);
      }

      // Create new page with blocks
      const newPage = await prisma.dynamicPage.create({
        data: {
          slug,
          title,
          description: originalPage.description,
          pageType: originalPage.pageType,
          metaTitle: originalPage.metaTitle,
          metaDescription: originalPage.metaDescription,
          ogImage: originalPage.ogImage,
          layout: originalPage.layout,
          settings: originalPage.settings,
          isPublished: false, // Always unpublished
          createdBy: req.user?.id,
          blocks: {
            create: originalPage.blocks.map(block => ({
              blockType: block.blockType,
              content: block.content,
              settings: block.settings,
              sortOrder: block.sortOrder,
              isVisible: block.isVisible,
            })),
          },
        },
        include: {
          blocks: true,
        },
      });

      res.status(201).json({
        message: 'Page duplicated successfully',
        page: {
          ...newPage,
          settings: newPage.settings ? JSON.parse(newPage.settings) : null,
          blocks: newPage.blocks.map(block => ({
            ...block,
            content: JSON.parse(block.content),
            settings: block.settings ? JSON.parse(block.settings) : null,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // Content Blocks
  // ==========================================

  // Get blocks for a page
  getBlocks = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { pageId } = req.params;

      const blocks = await prisma.contentBlock.findMany({
        where: { pageId: parseInt(pageId) },
        orderBy: { sortOrder: 'asc' },
      });

      res.json({
        blocks: blocks.map(block => ({
          ...block,
          content: JSON.parse(block.content),
          settings: block.settings ? JSON.parse(block.settings) : null,
        })),
      });
    } catch (error) {
      next(error);
    }
  };

  // Create block
  createBlock = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { pageId } = req.params;
      const { blockType, content, settings, sortOrder, isVisible = true } = req.body;

      // Validate page exists
      const page = await prisma.dynamicPage.findUnique({
        where: { id: parseInt(pageId) },
      });

      if (!page) {
        throw new AppError('Page not found', 404);
      }

      // Get max sortOrder if not provided
      let order = sortOrder;
      if (order === undefined) {
        const maxBlock = await prisma.contentBlock.findFirst({
          where: { pageId: parseInt(pageId) },
          orderBy: { sortOrder: 'desc' },
        });
        order = (maxBlock?.sortOrder || 0) + 1;
      }

      const block = await prisma.contentBlock.create({
        data: {
          pageId: parseInt(pageId),
          blockType,
          content: JSON.stringify(content || {}),
          settings: settings ? JSON.stringify(settings) : null,
          sortOrder: order,
          isVisible,
        },
      });

      res.status(201).json({
        message: 'Block created successfully',
        block: {
          ...block,
          content: JSON.parse(block.content),
          settings: block.settings ? JSON.parse(block.settings) : null,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Update block
  updateBlock = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { blockId } = req.params;
      const { blockType, content, settings, sortOrder, isVisible } = req.body;

      const existingBlock = await prisma.contentBlock.findUnique({
        where: { id: parseInt(blockId) },
      });

      if (!existingBlock) {
        throw new AppError('Block not found', 404);
      }

      const updateData: any = {};
      if (blockType !== undefined) updateData.blockType = blockType;
      if (content !== undefined) updateData.content = JSON.stringify(content);
      if (settings !== undefined) updateData.settings = JSON.stringify(settings);
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (isVisible !== undefined) updateData.isVisible = isVisible;

      const block = await prisma.contentBlock.update({
        where: { id: parseInt(blockId) },
        data: updateData,
      });

      res.json({
        message: 'Block updated successfully',
        block: {
          ...block,
          content: JSON.parse(block.content),
          settings: block.settings ? JSON.parse(block.settings) : null,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Delete block
  deleteBlock = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { blockId } = req.params;

      const block = await prisma.contentBlock.findUnique({
        where: { id: parseInt(blockId) },
      });

      if (!block) {
        throw new AppError('Block not found', 404);
      }

      await prisma.contentBlock.delete({
        where: { id: parseInt(blockId) },
      });

      res.json({ message: 'Block deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

  // Reorder blocks
  reorderBlocks = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { pageId } = req.params;
      const { blockOrders } = req.body; // Array of { id, sortOrder }

      if (!Array.isArray(blockOrders)) {
        throw new AppError('blockOrders must be an array', 400);
      }

      // Update all blocks
      await Promise.all(
        blockOrders.map(({ id, sortOrder }) =>
          prisma.contentBlock.update({
            where: { id },
            data: { sortOrder },
          })
        )
      );

      // Fetch updated blocks
      const blocks = await prisma.contentBlock.findMany({
        where: { pageId: parseInt(pageId) },
        orderBy: { sortOrder: 'asc' },
      });

      res.json({
        message: 'Blocks reordered successfully',
        blocks: blocks.map(block => ({
          ...block,
          content: JSON.parse(block.content),
          settings: block.settings ? JSON.parse(block.settings) : null,
        })),
      });
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // Media Files
  // ==========================================

  // Get all media files
  getMediaFiles = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { folder, mimeType, search, page = '1', limit = '24' } = req.query;

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = {};

      if (folder) {
        where.folder = folder;
      }

      if (mimeType) {
        where.mimeType = { startsWith: mimeType as string };
      }

      if (search) {
        where.OR = [
          { filename: { contains: search as string, mode: 'insensitive' } },
          { originalName: { contains: search as string, mode: 'insensitive' } },
          { alt: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const [files, total] = await Promise.all([
        prisma.mediaFile.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.mediaFile.count({ where }),
      ]);

      res.json({
        files,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Upload media file (placeholder - actual upload handled by middleware)
  uploadMedia = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // This will be populated by multer middleware
      const file = (req as any).file;

      if (!file) {
        throw new AppError('No file uploaded', 400);
      }

      const { alt, caption } = req.body;
      const folder = (req as any).uploadFolder || 'uploads';

      // Create media record
      const mediaFile = await prisma.mediaFile.create({
        data: {
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          url: `/uploads/${folder}/${file.filename}`,
          path: file.path,
          width: file.width || null,
          height: file.height || null,
          alt,
          caption,
          folder,
          uploadedBy: req.user?.id,
        },
      });

      res.status(201).json({
        message: 'File uploaded successfully',
        file: mediaFile,
      });
    } catch (error) {
      next(error);
    }
  };

  // Update media file metadata
  updateMedia = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { alt, caption, folder } = req.body;

      const existingFile = await prisma.mediaFile.findUnique({
        where: { id: parseInt(id) },
      });

      if (!existingFile) {
        throw new AppError('File not found', 404);
      }

      const updateData: any = {};
      if (alt !== undefined) updateData.alt = alt;
      if (caption !== undefined) updateData.caption = caption;
      if (folder !== undefined && folder !== existingFile.folder) {
        throw new AppError('Moving uploaded files between folders is not supported', 400);
      }

      const mediaFile = await prisma.mediaFile.update({
        where: { id: parseInt(id) },
        data: updateData,
      });

      res.json({
        message: 'File updated successfully',
        file: mediaFile,
      });
    } catch (error) {
      next(error);
    }
  };

  // Delete media file
  deleteMedia = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const file = await prisma.mediaFile.findUnique({
        where: { id: parseInt(id) },
      });

      if (!file) {
        throw new AppError('File not found', 404);
      }

      // Delete physical file from disk (ignore error if file already missing)
      if (file.path) {
        const uploadRoot = path.resolve(process.cwd(), 'public', 'uploads');
        const resolvedFile = path.resolve(file.path);
        if (!resolvedFile.startsWith(`${uploadRoot}${path.sep}`)) {
          throw new AppError('Stored media path is outside the upload directory', 409);
        }
        await unlink(resolvedFile).catch(() => {});
      }

      await prisma.mediaFile.delete({
        where: { id: parseInt(id) },
      });

      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      next(error);
    }
  };

  // Get folders
  getFolders = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const folders = await prisma.mediaFile.groupBy({
        by: ['folder'],
        _count: { id: true },
      });

      res.json({
        folders: folders.map(f => ({
          name: f.folder || 'uploads',
          count: f._count.id,
        })),
      });
    } catch (error) {
      next(error);
    }
  };

  // ==========================================
  // Block Templates (Predefined block configs)
  // ==========================================

  // Get available block types
  getBlockTypes = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const blockTypes = [
        {
          type: 'heading',
          name: 'หัวข้อ',
          icon: '📝',
          description: 'หัวข้อขนาดต่างๆ (H1-H6)',
          defaultContent: { text: '', level: 2 },
        },
        {
          type: 'text',
          name: 'ข้อความ',
          icon: '📄',
          description: 'ข้อความทั่วไป รองรับ Markdown',
          defaultContent: { text: '' },
        },
        {
          type: 'image',
          name: 'รูปภาพ',
          icon: '🖼️',
          description: 'รูปภาพเดี่ยว',
          defaultContent: { url: '', alt: '', caption: '' },
        },
        {
          type: 'gallery',
          name: 'แกลลอรี่',
          icon: '🎨',
          description: 'รูปภาพหลายรูปแบบ Grid',
          defaultContent: { images: [], columns: 3 },
        },
        {
          type: 'banner',
          name: 'แบนเนอร์',
          icon: '🎯',
          description: 'แบนเนอร์โปรโมชั่น',
          defaultContent: { imageUrl: '', title: '', subtitle: '', buttonText: '', buttonLink: '' },
        },
        {
          type: 'grid',
          name: 'Grid',
          icon: '⬜',
          description: 'Layout Grid สำหรับจัดเนื้อหา',
          defaultContent: { columns: 2, items: [] },
        },
        {
          type: 'button',
          name: 'ปุ่ม',
          icon: '🔘',
          description: 'ปุ่มกด CTA',
          defaultContent: { text: 'Click me', link: '', style: 'primary' },
        },
        {
          type: 'divider',
          name: 'เส้นแบ่ง',
          icon: '➖',
          description: 'เส้นแบ่งเนื้อหา',
          defaultContent: { style: 'solid' },
        },
        {
          type: 'spacer',
          name: 'ช่องว่าง',
          icon: '⬛',
          description: 'ช่องว่างระหว่างเนื้อหา',
          defaultContent: { height: 40 },
        },
        {
          type: 'html',
          name: 'HTML',
          icon: '💻',
          description: 'HTML Code แบบกำหนดเอง',
          defaultContent: { html: '' },
        },
        {
          type: 'product-list',
          name: 'รายการสินค้า',
          icon: '🛒',
          description: 'แสดงสินค้าจาก Shop',
          defaultContent: { categoryId: null, limit: 8, featured: false },
        },
        {
          type: 'countdown',
          name: 'นับถอยหลัง',
          icon: '⏰',
          description: 'นาฬิกานับถอยหลัง',
          defaultContent: { endDate: '', title: '' },
        },
        {
          type: 'video',
          name: 'วิดีโอ',
          icon: '🎬',
          description: 'วิดีโอ YouTube/Embed',
          defaultContent: { url: '', autoplay: false },
        },
        {
          type: 'accordion',
          name: 'หีบเพลง',
          icon: '📋',
          description: 'คำถามที่พบบ่อย / FAQ',
          defaultContent: { items: [] },
        },
        {
          type: 'tabs',
          name: 'แท็บ',
          icon: '📑',
          description: 'เนื้อหาแบบแท็บ',
          defaultContent: { tabs: [] },
        },
      ];

      res.json({ blockTypes });
    } catch (error) {
      next(error);
    }
  };
}
