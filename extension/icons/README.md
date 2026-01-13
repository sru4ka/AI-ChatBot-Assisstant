# Extension Icons

Create PNG icons at the following sizes:
- icon16.png (16x16)
- icon48.png (48x48)
- icon128.png (128x128)

You can use the provided SVG (icon16.svg) as a template and convert it to PNG at different sizes.

## Quick Icon Creation

Use any online tool like:
- https://realfavicongenerator.net/
- https://www.favicon-generator.org/

Or use ImageMagick:
```bash
convert icon16.svg -resize 16x16 icon16.png
convert icon16.svg -resize 48x48 icon48.png
convert icon16.svg -resize 128x128 icon128.png
```

## Temporary Workaround

For testing, you can temporarily use any 16x16, 48x48, and 128x128 PNG images named accordingly.
