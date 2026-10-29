// One-time source-asset preparation. The optimized outputs are committed in public/.
// Downloads are from verified Pexels photo pages; see public/photography.json.
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
for (const name of ["curry", "roast", "pasta", "rice", "bowl", "beans"]) {
  const source = await readFile(`/private/tmp/kitchen-${name}.jpg`);
  await sharp(source)
    .rotate()
    .resize(1100, 825, { fit: "cover", position: sharp.strategy.attention })
    .webp({ quality: 79, effort: 6 })
    .toFile(`public/images/${name}.webp`);
  await sharp(source)
    .rotate()
    .resize(640, 400, { fit: "cover", position: sharp.strategy.attention })
    .webp({ quality: 77, effort: 6 })
    .toFile(`public/images/${name}-thumb.webp`);
}
const icon = await readFile("public/icon.svg");
for (const size of [180, 192, 512])
  await sharp(icon)
    .resize(size, size)
    .png()
    .toFile(`public/${size === 180 ? "apple-touch-icon" : `icon-${size}`}.png`);
