# IRIS "ARK AAA" art direction

Goal: the site should feel like the front end of an ARK-world game, not a themed web shop. Original art only (no
copied game assets); the site is not part of Studio Wildcard.

## Look
- Material: dark gunmetal and Tek hull plating, machined edges, small hex engraving, worn edges with a faint warm
  rim light. Crimson energy seams (the IRIS Christmas Tek palette), champagne-gold corner brackets and latches.
- Depth: every surface is a *plate* with a bevel, an inner shadow and a lit edge. Nothing is a flat rectangle.
- Shape language: hexagon ends, chamfered corners, notches. No rounded pills, no soft cards.
- Light: one warm key light from the top-left, so every frame highlights the same edges.

## Where texture goes (and where it must not)
- Heavy texture: frames, borders, corner ornaments, buttons, slot frames, tab bars, icon medallions.
- Calm reading plates: any area that carries body text stays near-flat (luminance variation under 4 percent), so
  text keeps 7:1 (WCAG AAA). The existing `make_ui_textures.py` asserts this per pixel; new assets must pass it.
- Motion only under `prefers-reduced-motion: no-preference`.

## Asset kit (pilot = Shop page)
1. Panel frame, 9-slice (border image), flat matte centre.
2. Button plate sheet: normal, hover, pressed, disabled.
3. Item slot frames, one per product category colour.
4. Later: hex icon set, tab bar, popup frame, progress bars, section dividers, page backdrops.

## Budget
- WebP, each asset under 120 KB, one sprite sheet per kit where possible (mobile LCP is already near 4.6 s).
