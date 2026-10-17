'use client';

import { HomeHero } from './HomeHero';
import { AccountStrip } from './AccountStrip';
import { HowItWorks } from './HowItWorks';
import { FeaturedProducts } from './FeaturedProducts';
import { ServerModesTeaser } from './ServerModesTeaser';
import { MarketTeaser } from './MarketTeaser';
import { CommunityLinks } from './CommunityLinks';

/**
 * Home page composition (IRIS Private):
 * seasonal editorial hero → account strip → how it works → featured products
 * → server sets → player market → community. Sections are separated by
 * whitespace and hairlines only; nothing animates.
 */
export function HomeExperience() {
  return (
    <div className="space-y-16 pb-20 sm:space-y-20">
      <HomeHero />
      <AccountStrip />
      <HowItWorks />
      <FeaturedProducts />
      <ServerModesTeaser />
      <MarketTeaser />
      <CommunityLinks />
    </div>
  );
}

export default HomeExperience;
