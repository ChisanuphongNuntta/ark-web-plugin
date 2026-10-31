export type MedalName = 'sword' | 'dino' | 'block' | 'saddle' | 'gift' | 'coin' | 'shield' | 'crown';

/** Hex medallion icon from the generated ARK kit (public/images/ui/ark). Decorative: the label next to it names the thing. */
export function Medal({ name }: { name: MedalName }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="tk-medal" src={`/images/ui/ark/icon-${name}.webp`} alt="" width={26} height={24} aria-hidden="true" decoding="async" />;
}
