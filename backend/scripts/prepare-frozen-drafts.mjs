import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
const root=process.argv[2] || '/tmp/frozen';
const cleanBlueprint=value=>String(value||'').replace(/^"|"$/g,'').replace(/^Blueprint'/,'').replace(/'$/,'').toLowerCase();
const itemCategory=(row)=>{
 const v=(row.Category+' '+row._pageName+' '+row.Blueprint).toLowerCase();
 if(/chibi/.test(v))return 'Chibi';if(/skin|costume/.test(v))return 'Skins';if(/saddle/.test(v))return 'Saddles';if(/armor/.test(v))return 'Armor';if(/weapon|ammo/.test(v))return 'Weapons & Ammo';if(/structure|primalitemstructure/.test(v))return 'Structures';if(/resource/.test(v))return 'Resources';if(/consumable|food|recipe|kibble/.test(v))return 'Consumables';return 'Items';
};
const creatureCategory=row=>{const n=row.Name||row._pageName;if(/^Aberrant/.test(n))return 'Dinos · Aberrant';if(/^X-/.test(n))return 'Dinos · X';if(/^R-/.test(n))return 'Dinos · R';if(/^Tek/.test(n))return 'Dinos · Tek';if(/Wyvern/.test(n))return 'Dinos · Wyvern';if(/Angler|Mosa|Plesio|Tuso|Basilosaur|Megalodon|Dunkle|Ichthy|Manta|Coel|Salmon|Cnidaria|Eurypterid|Leeds/.test(n))return 'Dinos · Aquatic';return 'Dinos';};
try{
const existing=await prisma.product.findMany();const known=new Set();for(const p of existing){if(p.itemBlueprint)known.add(cleanBlueprint(p.itemBlueprint));const d=p.deliveryPayload?.definition;if(d?.Blueprint)known.add(cleanBlueprint(d.Blueprint));for(const item of d?.Items||[])if(item.Blueprint)known.add(cleanBlueprint(item.Blueprint));}
const categories=await prisma.category.findMany();const ids=new Map(categories.map(c=>[c.name,c.id]));
const medians={};for(const c of categories){const prices=existing.filter(p=>p.categoryId===c.id&&p.isActive&&p.price>0).map(p=>Math.max(1,Math.round(p.price/Math.max(p.quantity,1)))).sort((a,b)=>a-b);medians[c.name]=prices[Math.floor(prices.length/2)]||10;}
const report={created:0,existing:0,excluded:0,byCategory:{},missingImages:0};
for(const kind of ['creatures','items']){
const rows=JSON.parse(fs.readFileSync(root+'/wiki-'+kind+'.json','utf8')).rows;
for(const row of rows){const bp=cleanBlueprint(row.Blueprint);if(!bp.startsWith('/game/')||bp.startsWith('/game/asa/')||/\/mods\/|\/mobile\//.test(bp)){report.excluded++;continue;}if(kind==='creatures'&&!row.Released){report.excluded++;continue;}if(known.has(bp)){report.existing++;continue;}known.add(bp);
const name=row.Name||row._pageName;const category=kind==='creatures'?creatureCategory(row):itemCategory(row);const price=medians[category]||10;const original=String(row.Blueprint).replace(/^"|"$/g,'');const blueprint=original.startsWith('Blueprint')?original:`Blueprint'${original}'`;
const type=kind==='creatures'?'dino':'item';const special=/Boss|Titan|Alpha|Corrupt|Mission|Untameable/i.test(name+' '+row.TaxonomicGroup);
const definition=type==='dino'?{Type:'dino',Blueprint:blueprint,Level:150,Price:price,Description:name}:{Type:'item',Items:[{Blueprint:blueprint,Amount:1,Quality:0,ForceBlueprint:false}],Price:price,Description:name};
await prisma.product.create({data:{name,description:`ร่างรอตรวจราคาและการส่งของ · ราคาเสนอ ${price} IC อ้างอิงค่ากลางต่อหน่วยของหมวด ${category}${special?' · สัตว์พิเศษต้องตรวจว่าส่งมอบได้':''}`,price,categoryId:ids.get(category),productType:type,itemBlueprint:type==='item'?blueprint:null,quantity:1,quality:0,isBlueprint:false,isActive:false,externalKey:'frozen-reference:'+bp,requiredCapabilities:[`delivery.${type}.v1`],deliveryPayload:{schemaVersion:1,type,source:'ark-wiki-reference',definition,review:{status:'pending',priceBasis:'category-median-per-unit',source:'https://ark.wiki.gg/wiki/'+encodeURIComponent(row._pageName),special}}}});
report.created++;report.missingImages++;report.byCategory[category]=(report.byCategory[category]||0)+1;
}}
console.log(JSON.stringify(report,null,2));
}finally{await prisma.$disconnect();}
