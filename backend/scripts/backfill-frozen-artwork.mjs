import fs from 'node:fs';
import {PrismaClient} from '@prisma/client';
const db=new PrismaClient();
const norm=s=>String(s).replace(/\s*\([^)]*\)/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
try{const products=await db.product.findMany({select:{id:true,name:true,imageUrl:true,isActive:true,externalKey:true,categoryId:true}});const images=new Map();for(const p of products)if(p.imageUrl&&!/generic|mock|placeholder/.test(p.imageUrl))images.set(norm(p.name),p.imageUrl);let matched=0;for(const p of products.filter(p=>!p.isActive&&p.externalKey?.startsWith('frozen-reference:'))){const image=images.get(norm(p.name));if(image&&!p.imageUrl){await db.product.update({where:{id:p.id},data:{imageUrl:image}});matched++;}}console.log(JSON.stringify({drafts:products.filter(p=>p.externalKey?.startsWith('frozen-reference:')).length,exactNameArtworkAdded:matched}));}finally{await db.$disconnect();}
