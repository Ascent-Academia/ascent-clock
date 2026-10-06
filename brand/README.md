# Ascent Academia brand assets

Official Ascent Academia logo files. Brand violet: `#8c68ac`.

- `ascent-full-logo-purple.svg` / `ascent-full-logo-white.svg`: the full logo (mark and "Ascent Academia" wordmark)
- `ascent-mark-purple.svg`: the "A" mark on its own

The clock draws the full logo inline in `index.html` with `fill="currentColor"`, so it follows the theme: white on Midnight and High contrast, violet on Daylight.

Replacing an SVG in this folder does not update that inline logo. Update the SVG
markup in `../index.html` as well, then check all three themes. App and favicon
assets live at the repository root and are referenced by `index.html` and
`manifest.webmanifest`. See the [main README](../README.md) for caching and local
verification.
