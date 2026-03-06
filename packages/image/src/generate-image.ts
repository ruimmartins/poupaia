import sharp from 'sharp';
import fetch from 'node-fetch';
import fs from 'fs/promises';

const calculateDiscount = (original: number, current: number): number => {
  return Math.round(((original - current) / original) * 100);
};

export const generateProductImage = async ({ imageUrl, title, originalPrice, currentPrice }: { imageUrl: string; title: string; originalPrice: number; currentPrice: number }) => {
  const width = 1000;
  const height = 1000;

  const discount = calculateDiscount(originalPrice, currentPrice);

  // 1️⃣ Buscar imagem produto
  const response = await fetch(imageUrl);
  const productBuffer = Buffer.from(await response.arrayBuffer());

  const resizedProduct = await sharp(productBuffer)
    .resize(800, 800, {
      fit: 'contain',
      background: '#ffffff',
    })
    .png()
    .toBuffer();

  // 2️⃣ Carregar logo
  const logoBuffer = await fs.readFile('./logo.png');

  const resizedLogo = await sharp(logoBuffer).resize(180).png().toBuffer();

  // 3️⃣ Criar SVG overlay
  const overlaySvg = `
  <svg width="${width}" height="${height}">
    
    <!-- Badge desconto -->
    <rect x="40" y="820" rx="20" ry="20"
      width="200" height="100"
      fill="#ff3b30"/>
    <text x="140" y="885"
      font-size="60"
      fill="white"
      font-family="Arial"
      font-weight="bold"
      text-anchor="middle">
      -${discount}%
    </text>

    <!-- Caixa preço -->
    <rect x="550" y="760" rx="30" ry="30"
      width="400" height="180"
      fill="#d6f0ff"/>

    <!-- Preço original -->
    <text x="750" y="815"
      font-size="40"
      fill="#555"
      font-family="Arial"
      text-anchor="middle"
      text-decoration="line-through">
      ${originalPrice.toFixed(2)}€
    </text>

    <!-- Preço atual -->
    <text x="750" y="900"
      font-size="80"
      fill="#0077cc"
      font-family="Arial"
      font-weight="bold"
      text-anchor="middle">
      ${currentPrice.toFixed(2)}€
    </text>

  </svg>
  `;

  // 4️⃣ Criar imagem base branca
  const finalImage = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite([
      { input: resizedProduct, top: 120, left: 100 },
      { input: resizedLogo, top: 40, left: 40 },
      { input: Buffer.from(overlaySvg), top: 0, left: 0 },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  return finalImage;
};
