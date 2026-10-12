# PixelMplus12

- File: `PixelMplus12-Regular.ttf` (unmodified)
- Author: itouhiro; based on M+ bitmap fonts by M+ FONTS PROJECT
- Source: https://github.com/itouhiro/PixelMplus
- Download: https://raw.githubusercontent.com/itouhiro/PixelMplus/master/PixelMplus12-Regular.ttf
- License source: https://github.com/itouhiro/PixelMplus/blob/master/misc/mplus_bitmap_fonts/LICENSE_E
- License: `LICENSE_PixelMplus.txt`

`PixelMplus12-Regular.woff` is a lossless WOFF 1.0 package of the complete
original font. No glyphs or character mappings were removed. CSS prefers WOFF
and retains the original TTF as a fallback. The files are 409,752 and 1,274,396
bytes respectively (67.8% smaller); all 7,253 glyphs remain.

Generate with `npm run export:font` from `web/`; verify with
`npm run verify:font`. The converter uses only Python's standard library and
checks that decompression reconstructs the original TTF byte for byte,
including every table and its checksum. The original TTF and license remain
unchanged. [WOFF 1.0 specification](https://www.w3.org/TR/WOFF/) defines the
packaging. WOFF2 is not included; no additional converter dependencies are
required for this version.

Used only inside `.game-ui`. The preview uses 24px text, twice the native
12px size. General page text continues to use the system font.
