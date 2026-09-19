'use client';
import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams,useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Search, PawPrint, Package, ArrowLeft, ArrowRight } from 'lucide-react';
import { shopApi } from '@/lib/contracts/client';
import { categoryLabel } from '@/lib/catalogLabels';
import { FrozenHero } from '@/components/shop/FrozenHero';
import { PalworldProductCard } from '@/components/shop/PalworldProductCard';
import { ProductBuyModal } from '@/components/shop/ProductBuyModal';
import type { Product } from '@/lib/contracts/types';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

function Catalog() {
 const params=useSearchParams();const router=useRouter();
 const category=params.get('category');const type=params.get('type');const page=Math.max(1,Number(params.get('page'))||1);
 const update=(values:Record<string,string|null>)=>{const next=new URLSearchParams(params.toString());for(const [k,v] of Object.entries(values)){if(v)next.set(k,v);else next.delete(k);}router.push('/shop'+(next.size?'?'+next:''),{scroll:false});};
 const {data:categoryData}=useQuery({queryKey:['catalog-categories'],queryFn:shopApi.listCategories,staleTime:60000});
 const {data,isLoading,isError,refetch}=useQuery({queryKey:['contract','products',params.toString()],queryFn:()=>shopApi.listProducts({categoryId:category?Number(category):undefined,type:type==='dino'||type==='item'?type:undefined,search:params.get('search')||undefined,minPrice:params.has('minPrice')?Number(params.get('minPrice')):undefined,maxPrice:params.has('maxPrice')?Number(params.get('maxPrice')):undefined,page,limit:24})});
 const categories=(categoryData?.categories||[]).filter(c=>(c._count?.products??0)>0).filter(c=>!type||(type==='dino'?/Dinos|Creatures/i.test(c.name):!/Dinos|Creatures/i.test(c.name)));
 const [buyingProduct, setBuyingProduct] = useState<Product | null>(null);
 const [formError,setFormError]=useState('');

 const buyParam = params.get('buy');
 useEffect(() => {
   if (buyParam) {
     const id = Number(buyParam);
     if (Number.isInteger(id) && id > 0) {
       const found = data?.products?.find((p) => p.id === id);
       if (found) {
         setBuyingProduct(found);
       } else {
         shopApi.getProduct(id).then((res) => {
           if (res?.product) setBuyingProduct(res.product);
         }).catch(() => {});
       }
     }
   }
 }, [buyParam, data?.products]);

 const handleCloseModal = () => {
   setBuyingProduct(null);
   if (params.get('buy')) {
     const next = new URLSearchParams(params.toString());
     next.delete('buy');
     router.replace('/shop' + (next.size ? '?' + next : ''), { scroll: false });
   }
 };

 const submit=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const form=new FormData(event.currentTarget);const min=String(form.get('min')||'');const max=String(form.get('max')||'');if(min&&max&&Number(min)>Number(max)){setFormError('ราคาต่ำสุดต้องไม่เกินราคาสูงสุด');return;}setFormError('');update({search:String(form.get('search')||'').trim()||null,minPrice:min||null,maxPrice:max||null,page:null});};
 return <div className="page-shell pb-16 space-y-7"><FrozenHero/>
  <section id="catalog" className="scroll-mt-32">
   <div className="flex flex-wrap items-end justify-between gap-4 mb-6"><div><p className="eyebrow">THE EXPEDITION COLLECTION</p><h2 className="font-display text-2xl sm:text-3xl mt-2">เลือกคู่ใจ เตรียมพร้อมออกเดินทาง <span className="sr-only">Official Store Database</span></h2></div><Link href="/orders" className="text-sm text-iris-cyan">ติดตามคำสั่งซื้อ ↗</Link></div>
   <div className="flex gap-2 mb-6" aria-label="ประเภทสินค้า">{[{id:null,label:'ทั้งหมด',icon:Package},{id:'dino',label:'สัตว์ ARK',icon:PawPrint},{id:'item',label:'ไอเทม',icon:Package}].map(tab=><button key={tab.label} onClick={()=>update({type:tab.id,category:null,page:null})} aria-pressed={type===tab.id} className={type===tab.id?'btn-primary':'btn-secondary'}><tab.icon size={16}/>{tab.label}</button>)}</div>
   <div className="frozen-catalog-layout"><aside className="frozen-category-list" aria-label="หมวดหมู่สินค้า"><button aria-pressed={!category} onClick={()=>update({category:null,page:null})}>ทุกหมวดหมู่</button>{categories.map(c=><button key={c.id} aria-pressed={category===String(c.id)} onClick={()=>update({category:String(c.id),page:null})}><span>{categoryLabel(c.name)}</span><span className="tabular-nums text-xs">{c._count?.products}</span></button>)}</aside>
   <div className="min-w-0"><form key={params.toString()} onSubmit={submit} className="frozen-toolbar" role="search"><label className="search-field">ค้นหาสินค้า<input name="search" placeholder="ค้นหาชื่อสินค้า เช่น Rex, Saddle" defaultValue={params.get('search')||''}/></label><label>ต่ำสุด (IC)<input className="w-24" name="min" type="number" min="0" placeholder="Min" defaultValue={params.get('minPrice')||''}/></label><label>สูงสุด (IC)<input className="w-24" name="max" type="number" min="0" placeholder="Max" defaultValue={params.get('maxPrice')||''}/></label><button className="btn-primary self-end" type="submit"><Search size={16}/>ค้นหา</button><button className="btn-secondary self-end text-xs" type="submit">ใช้ช่วงราคา</button>{params.size>0&&<Link href="/shop" className="text-xs self-end py-3 text-iris-cyan">ล้างตัวกรอง</Link>}{formError&&<p role="alert" className="w-full text-rose-300 text-sm">{formError}</p>}</form>
   <p className="text-sm text-iris-muted mb-4" aria-live="polite">{isLoading?'กำลังค้นหาสินค้า…':isError?'ยังโหลดรายการไม่ได้':`${data?.pagination.total.toLocaleString()??0} รายการ`}</p>
   {isLoading?<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">{Array.from({length:8},(_,i)=><Skeleton key={i} className="h-64 rounded-2xl"/>)}</div>:isError?<ErrorMessage title="โหลดสินค้าไม่สำเร็จ" message="กรุณาลองอีกครั้ง" onRetry={refetch}/>:!data?.products.length?<EmptyState title="ไม่พบสินค้าตรงเงื่อนไขการค้นหา" description="ลองเปลี่ยนชื่อหรือเลือกหมวดหมู่อื่น" actionText="ล้างข้อมูลการค้นหาทั้งหมด" onAction={()=>router.push('/shop')}/>:<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">{data.products.map(p=><PalworldProductCard key={p.id} product={p} onQuickBuy={setBuyingProduct}/>)}</div>}
   {(data?.pagination.totalPages??0)>1&&<nav aria-label="หน้ารายการสินค้า" className="flex justify-between items-center mt-8 gap-3"><button disabled={page<=1} className="btn-secondary" onClick={()=>update({page:String(page-1)})}><ArrowLeft size={16}/>ก่อนหน้า</button><span className="text-xs text-iris-muted">{page} / {data?.pagination.totalPages}</span><button disabled={page>=(data?.pagination.totalPages??1)} className="btn-secondary" onClick={()=>update({page:String(page+1)})}>ถัดไป<ArrowRight size={16}/></button></nav>}
   </div></div>
  </section>
  <ProductBuyModal product={buyingProduct} isOpen={!!buyingProduct} onClose={handleCloseModal}/>
 </div>;
}
export default function ShopPage(){return <Suspense fallback={<div className="page-shell py-16">กำลังเปิดร้านค้า…</div>}><Catalog/></Suspense>;}
