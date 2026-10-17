/** Shared labels for the content admin screens (list + editor). */

export const PAGE_TYPE_OPTIONS = [
  { value: 'custom', label: 'ทั่วไป' },
  { value: 'home', label: 'หน้าหลัก' },
  { value: 'promotion', label: 'โปรโมชั่น' },
  { value: 'event', label: 'กิจกรรม' },
  { value: 'info', label: 'ข้อมูล' },
];

/** Values understood by /p/[slug] (full-width widens the content column). */
export const LAYOUT_OPTIONS = [
  { value: 'default', label: 'มาตรฐาน' },
  { value: 'full-width', label: 'เต็มความกว้าง' },
  { value: 'sidebar', label: 'มีแถบข้าง' },
];

export function pageTypeLabel(value: string | null | undefined): string {
  return PAGE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value ?? '—';
}

export const BLOCK_LABEL: Record<string, string> = {
  heading: 'หัวข้อ',
  text: 'ข้อความ',
  image: 'รูปภาพ',
  gallery: 'แกลเลอรี',
  banner: 'แบนเนอร์',
  grid: 'กริด',
  button: 'ปุ่ม',
  divider: 'เส้นคั่น',
  spacer: 'ระยะห่าง',
  html: 'HTML',
  'product-list': 'รายการสินค้า',
  countdown: 'นับถอยหลัง',
  video: 'วิดีโอ',
  accordion: 'คำถามพับได้',
  tabs: 'แท็บ',
};

export function blockLabel(type: string): string {
  return BLOCK_LABEL[type] ?? type;
}
