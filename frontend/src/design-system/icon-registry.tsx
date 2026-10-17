import React from 'react';
import {
  PackageSearch,
  Sword,
  Footprints,
  Shield,
  Layers,
  Zap,
  Flame,
  Fish,
  Shirt,
  Box,
  Apple,
  Home,
  Sparkles,
  Smile,
  BookOpen,
  Package,
  Wallet,
  CreditCard,
  Building2,
  QrCode,
  Smartphone,
  FlaskConical,
  ShoppingCart,
  ShieldCheck,
  Server,
  User,
  HelpCircle,
  TrendingUp,
  Tag,
  Trophy,
  Medal,
  Award,
  Crown,
  Lock,
  LucideProps,
} from 'lucide-react';

export type IconKey =
  | 'all'
  | 'weapon'
  | 'creature'
  | 'dino'
  | 'aberrant'
  | 'x-creature'
  | 'r-creature'
  | 'tek'
  | 'wyvern'
  | 'aquatic'
  | 'armor'
  | 'saddle'
  | 'resource'
  | 'consumable'
  | 'structure'
  | 'skin'
  | 'chibi'
  | 'engram'
  | 'kit'
  | 'wallet'
  | 'topup'
  | 'shop'
  | 'admin'
  | 'server'
  | 'user'
  | 'support'
  | 'security'
  | 'market'
  | 'payment-sandbox'
  | 'payment-promptpay'
  | 'payment-truemoney'
  | 'payment-card'
  | 'trophy'
  | 'medal'
  | 'crown';

const ICON_MAP: Record<IconKey, React.ComponentType<LucideProps>> = {
  all: Layers,
  weapon: Sword,
  creature: Footprints,
  dino: Footprints,
  aberrant: Zap,
  'x-creature': Sparkles,
  'r-creature': Flame,
  tek: Zap,
  wyvern: Flame,
  aquatic: Fish,
  armor: Shield,
  saddle: Shirt,
  resource: Box,
  consumable: Apple,
  structure: Home,
  skin: Sparkles,
  chibi: Smile,
  engram: BookOpen,
  kit: Package,
  wallet: Wallet,
  topup: CreditCard,
  shop: ShoppingCart,
  admin: ShieldCheck,
  server: Server,
  user: User,
  support: HelpCircle,
  security: Lock,
  market: TrendingUp,
  'payment-sandbox': FlaskConical,
  'payment-promptpay': QrCode,
  'payment-truemoney': Smartphone,
  'payment-card': CreditCard,
  trophy: Trophy,
  medal: Medal,
  crown: Crown,
};

export interface CategoryIconProps {
  iconKey?: IconKey | string;
  slug?: string;
  name?: string;
  emoji?: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * Adapter function to map legacy category slugs/names/emojis to canonical Lucide icons.
 */
export function resolveCategoryIcon(
  iconKey?: string,
  slug?: string,
  name?: string,
  emoji?: string
): React.ComponentType<LucideProps> {
  if (iconKey && iconKey in ICON_MAP) {
    return ICON_MAP[iconKey as IconKey];
  }

  const searchString = `${iconKey || ''} ${slug || ''} ${name || ''} ${emoji || ''}`.toLowerCase();

  if (searchString.includes('weapon') || searchString.includes('อาวุธ') || searchString.includes('⚔')) return Sword;
  if (searchString.includes('dino') || searchString.includes('creature') || searchString.includes('ไดโน') || searchString.includes('🦕') || searchString.includes('🦖')) return Footprints;
  if (searchString.includes('tek') || searchString.includes('aberrant') || searchString.includes('⚡')) return Zap;
  if (searchString.includes('wyvern') || searchString.includes('fire') || searchString.includes('🔥')) return Flame;
  if (searchString.includes('aquatic') || searchString.includes('water') || searchString.includes('🐟')) return Fish;
  if (searchString.includes('armor') || searchString.includes('เกราะ') || searchString.includes('🛡')) return Shield;
  if (searchString.includes('resource') || searchString.includes('ทรัพยากร') || searchString.includes('📦')) return Box;
  if (searchString.includes('consumable') || searchString.includes('อาหาร') || searchString.includes('🍎')) return Apple;
  if (searchString.includes('structure') || searchString.includes('สิ่งปลูกสร้าง') || searchString.includes('🏠')) return Home;
  if (searchString.includes('kit') || searchString.includes('ชุด') || searchString.includes('🎒')) return Package;
  if (searchString.includes('engram') || searchString.includes('📜')) return BookOpen;
  if (searchString.includes('skin') || searchString.includes('✨')) return Sparkles;
  if (searchString.includes('chibi') || searchString.includes('👶')) return Smile;
  if (searchString.includes('topup') || searchString.includes('เติมเงิน') || searchString.includes('💳')) return CreditCard;
  if (searchString.includes('promptpay') || searchString.includes('พร้อมเพย์') || searchString.includes('🏦')) return QrCode;
  if (searchString.includes('truemoney') || searchString.includes('ทรูมันนี่') || searchString.includes('📱')) return Smartphone;
  if (searchString.includes('sandbox') || searchString.includes('ทดลอง') || searchString.includes('🧪')) return FlaskConical;
  if (searchString.includes('trophy') || searchString.includes('🏆')) return Trophy;
  if (searchString.includes('medal') || searchString.includes('🥇') || searchString.includes('🥈') || searchString.includes('🥉')) return Medal;

  return PackageSearch;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  iconKey,
  slug,
  name,
  emoji,
  className = 'w-4 h-4',
  size,
  strokeWidth = 1.75,
}) => {
  const IconComponent = resolveCategoryIcon(iconKey, slug, name, emoji);

  return (
    <IconComponent
      className={className}
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden="true"
    />
  );
};

export default CategoryIcon;
