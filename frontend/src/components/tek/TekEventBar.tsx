/** Announcement ribbon. Only statements that are true of the live system. */
const ITEMS = [
  'ซื้อของในร้านแล้วส่งเข้าเกมอัตโนมัติไปยังเซิร์ฟเวอร์ที่คุณเลือก',
  'ตลาดผู้เล่น: มองไดโนในเกมแล้วพิมพ์ /market upload เพื่อลงขายผ่านเว็บ',
  'ไดโนที่ซื้อส่งเป็นไครโอพ็อด รับของด้วย /claimdino',
  'เทศกาลคริสต์มาส IRIS เปิด 1 ธันวาคม กิจกรรมและของขวัญกำลังเตรียมพร้อม',
];

export function TekEventBar() {
  const loop = [...ITEMS, ...ITEMS];
  return (
    <div className="tk-event" role="region" aria-label="ประกาศ">
      <div className="track">
        {loop.map((text, i) => (
          <span key={i} aria-hidden={i >= ITEMS.length ? true : undefined}>{text}</span>
        ))}
      </div>
    </div>
  );
}
