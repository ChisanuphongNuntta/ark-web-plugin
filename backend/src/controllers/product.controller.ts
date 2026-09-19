import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';

export class ProductController {
  // Get all products
  getProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        categoryId,
        search,
        minPrice,
        maxPrice,
        type,
        page = '1',
        limit = '20',
      } = req.query;

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const where: any = {
        isActive: true,
      };

      if (categoryId) {
        const parsedCat = parseInt(categoryId as string);
        if (!isNaN(parsedCat)) {
          where.categoryId = parsedCat;
        } else {
          const catStr = (categoryId as string).toLowerCase();
          const catMap: Record<string, number> = { armor: 3, material: 4 };
          if (catMap[catStr]) {
            where.categoryId = catMap[catStr];
          } else if (catStr === 'blueprint') {
            where.isBlueprint = true;
          } else {
            where.OR = [
              { name: { contains: catStr, mode: 'insensitive' } },
              { description: { contains: catStr, mode: 'insensitive' } },
            ];
          }
        }
      }

      if (type === 'item' || type === 'dino') {
        where.productType = type;
      }

      if (search) {
        const searchOr = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } },
        ];
        if (where.OR) {
          where.AND = [
            ...(where.AND || []),
            { OR: where.OR },
            { OR: searchOr },
          ];
          delete where.OR;
        } else if (where.AND) {
          where.AND.push({ OR: searchOr });
        } else {
          where.OR = searchOr;
        }
      }

      if (minPrice || maxPrice) {
        where.price = {};
        if (minPrice) where.price.gte = parseInt(minPrice as string);
        if (maxPrice) where.price.lte = parseInt(maxPrice as string);
      }

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: { category: true },
          orderBy: { createdAt: 'desc' },
          skip,
          take: parseInt(limit as string),
        }),
        prisma.product.count({ where }),
      ]);

      res.json({
        products,
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

  // Get featured products
  getFeaturedProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const products = await prisma.product.findMany({
        where: {
          isActive: true,
          isFeatured: true,
        },
        include: { category: true },
        take: 10,
      });

      res.json({ products });
    } catch (error) {
      next(error);
    }
  };

  // Get categories
  getCategories = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const categories = await prisma.category.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: {
          _count: {
            select: { products: { where: { isActive: true } } },
          },
        },
      });

      res.json({ categories });
    } catch (error) {
      next(error);
    }
  };

  // Get product by ID
  getProductById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const product = await prisma.product.findUnique({
        where: { id: parseInt(id) },
        include: { category: true },
      });

      if (!product || !product.isActive) {
        return res.status(404).json({ error: 'Product not found' });
      }

      res.json({ product });
    } catch (error) {
      next(error);
    }
  };
}
