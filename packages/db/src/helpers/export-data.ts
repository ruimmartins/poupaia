#!/usr/bin/env -S npx ts-node

import * as dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { connectToDatabase, closeConnection, getProductsCollection } from '../index';

// Carregar .env (procura na raiz do projeto)
const envPath = path.resolve(__dirname, '../../../../.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('📄 Loaded .env from:', envPath);
} else {
  console.log('⚙️  Using environment variables from system');
}


const main = async () => {
    const db = await connectToDatabase();
    const collection = await getProductsCollection(db);

    const brands = await collection.distinct('brand');

    console.log('Unique brands:', brands.length);

    // Export brands to CSV (one brand per line)
    const csvContent = brands.join('\n');
    const fs = await import('fs');
    const outputPath = path.resolve(__dirname, 'brands.csv');
    fs.writeFileSync(outputPath, csvContent, 'utf8');
    console.log(`Brands exported to: ${outputPath}`);

    await closeConnection();
}

main().catch(error => {
    console.error('Error exporting data:', error);
    process.exit(1);
});