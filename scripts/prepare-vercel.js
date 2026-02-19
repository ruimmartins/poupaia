const fs = require('fs');
const path = require('path');

// Copia os packages compilados para node_modules para o Vercel encontrar
const packages = ['ai', 'db', 'messaging'];
const root = path.join(__dirname, '..');

packages.forEach(pkg => {
  const src = path.join(root, 'packages', pkg);
  const dest = path.join(root, 'node_modules', '@poupaia', pkg);
  
  // Cria diretório de destino
  fs.mkdirSync(dest, { recursive: true });
  
  // Copia package.json
  fs.copyFileSync(
    path.join(src, 'package.json'),
    path.join(dest, 'package.json')
  );
  
  // Copia pasta dist
  const distSrc = path.join(src, 'dist');
  const distDest = path.join(dest, 'dist');
  
  if (fs.existsSync(distSrc)) {
    fs.cpSync(distSrc, distDest, { recursive: true });
  }
});

console.log('✅ Packages preparados para Vercel');
