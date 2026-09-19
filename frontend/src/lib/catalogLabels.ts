export const categoryLabels: Record<string,string> = {
 'Dinos':'สัตว์ทั่วไป','Creatures':'สัตว์ ARK','Dinos · Aberrant':'สายพันธุ์ Aberrant','Dinos · X':'สายพันธุ์ X','Dinos · R':'สายพันธุ์ R','Dinos · Tek':'สัตว์จักรกล Tek','Dinos · Wyvern':'ไวเวิร์นและมังกร','Dinos · Aquatic':'สัตว์น้ำ','Weapons':'อาวุธ','Weapons & Ammo':'อาวุธและกระสุน','Armor':'ชุดเกราะ','Saddles':'อานสัตว์','Resources':'ทรัพยากร','Consumables':'อาหารและยา','Structures':'สิ่งปลูกสร้าง','Skins':'สกินตกแต่ง','Chibi':'ชิบิและของสะสม','Items':'ไอเทมอื่น ๆ','Engrams':'ปลดล็อกเอนแกรม','Kits':'ชุดสินค้า',
};
export const categoryLabel = (name:string) => categoryLabels[name] || name;
