import sharp from 'sharp';
import fetch from 'node-fetch';

const CANVAS_SIZE = 1000;
const BORDER_SIZE = 18;
const BLUE_BORDER = '#1a6fd4';
const BLUE_PRICE = '#1a6fd4';
const BLUE_PRICE_BG = '#e8f1fb';
const PRODUCT_IMG_SIZE = 500;
const PRODUCT_IMG_TOP = 80;

const calculateDiscount = (original: number, current: number): number => {
  return Math.round(((original - current) / original) * 100);
};

const formatPrice = (price: number): string => price.toFixed(2);

export interface GenerateProductImageInput {
  imageUrl: string;
  title: string;
  originalPrice: number;
  currentPrice: number;
}

export const generateProductImage = async ({
  imageUrl,
  title,
  originalPrice,
  currentPrice,
}: GenerateProductImageInput): Promise<Buffer> => {
  const size = CANVAS_SIZE;
  const discount = calculateDiscount(originalPrice, currentPrice);

  // 1. Fetch and resize product image (centered, contained, white bg)
  const response = await fetch(imageUrl);
  const productBuffer = Buffer.from(await response.arrayBuffer());

  const resizedProduct = await sharp(productBuffer)
    .resize(PRODUCT_IMG_SIZE, PRODUCT_IMG_SIZE, {
      fit: 'contain',
      background: '#ffffff',
    })
    .png()
    .toBuffer();

  // 2. SVG overlay: blue border, price box, discount badge
  const productLeft = Math.round((size - PRODUCT_IMG_SIZE) / 2);

  // Price box dimensions
  const priceBoxX = 60;
  const priceBoxY = 720;
  const priceBoxW = size - 120;
  const priceBoxH = 210;

  // Discount badge dimensions
  const badgeW = 170;
  const badgeH = 66;
  const badgeX = size - priceBoxX - badgeW;
  const badgeY = priceBoxY - badgeH / 2;

  const overlaySvg = `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">

  <!-- Blue border -->
  <rect x="0" y="0" width="${size}" height="${size}"
    fill="none"
    stroke="${BLUE_BORDER}"
    stroke-width="${BORDER_SIZE}"
    rx="28" ry="28"/>

  <!-- Price background box -->
  <rect x="${priceBoxX}" y="${priceBoxY}" width="${priceBoxW}" height="${priceBoxH}"
    rx="22" ry="22"
    fill="${BLUE_PRICE_BG}"
    stroke="${BLUE_BORDER}"
    stroke-width="3"/>

  <!-- Original price (struck-through, small, above) -->
  <text
    x="${priceBoxX + priceBoxW / 2}" y="${priceBoxY + 62}"
    font-size="38"
    fill="#888888"
    font-family="Arial, sans-serif"
    text-anchor="middle"
    text-decoration="line-through">
    ${formatPrice(originalPrice)}€
  </text>

  <!-- Current (promo) price (large, bold, blue) -->
  <text
    x="${priceBoxX + priceBoxW / 2}" y="${priceBoxY + 164}"
    font-size="100"
    fill="${BLUE_PRICE}"
    font-family="Arial, sans-serif"
    font-weight="bold"
    text-anchor="middle">
    ${formatPrice(currentPrice)}€
  </text>

  <!-- Discount badge -->
  <rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}"
    rx="14" ry="14"
    fill="#e53e3e"/>
  <text
    x="${badgeX + badgeW / 2}" y="${badgeY + badgeH / 2 + 13}"
    font-size="34"
    fill="white"
    font-family="Arial, sans-serif"
    font-weight="bold"
    text-anchor="middle">
    -${discount}%
  </text>

</svg>`;

  // 3. Composite: white canvas → product image (centered) → SVG overlay
  const finalImage = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: '#ffffff',
    },
  })
    .composite([
      {
        input: resizedProduct,
        top: PRODUCT_IMG_TOP,
        left: productLeft,
      },
      {
        input: Buffer.from(overlaySvg),
        top: 0,
        left: 0,
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  return finalImage;
};
