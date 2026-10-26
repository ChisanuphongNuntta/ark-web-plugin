/** Blender-rendered IRIS currency mark. Keep the visible IC unit beside money. */
export function IrisCoin({ size = 24, className = '' }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/images/currency/iris-coin-v2.webp" alt="" aria-hidden="true" width={size} height={size} className={`iris-coin ${className}`} style={{ width: size, height: size, objectFit: 'contain', display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' }} decoding="async" />;
}
