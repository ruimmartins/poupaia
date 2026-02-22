#!/usr/bin/env -S npx ts-node

import * as dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { connectToDatabase, closeConnection, getProductsCollection, getAlertsCollection, getMessagesCollection, getUsersCollection } from '../index';

// Carregar .env (procura na raiz do projeto)
const envPath = path.resolve(__dirname, '../../../../.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('📄 Loaded .env from:', envPath);
} else {
  console.log('⚙️  Using environment variables from system');
}

const createIndexes = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    const db = await connectToDatabase();
    const collection = await getProductsCollection(db);

    console.log('📊 Creating indexes...\n');

    // 0. Remover index antigo se existir (tinha category no text search)
    console.log('Checking for old text search index...');
    try {
      await collection.dropIndex('product_text_search');
      console.log('✓ Dropped old text search index');
    } catch (error: any) {
      if (error.code === 27 || error.message.includes('index not found')) {
        console.log('✓ No old index to drop');
      } else {
        console.log('⚠️  Could not drop old index:', error.message);
      }
    }

    // 1. Text index para pesquisa orgânica (APENAS no título)
    console.log('Creating text search index...');
    try {
      await collection.createIndex(
        { 
          title: 'text'
        },
        {
          name: 'product_text_search',
          collation: { locale: 'simple' }  // Override collection collation para text index
        }
      );
      console.log('✓ Text search index created');
    } catch (error: any) {
      if (error.code === 85 || error.message.includes('already exists')) {
        console.log('✓ Text search index already exists');
      } else {
        console.error('⚠️  Could not create text search index:', error.message);
        console.log('  Continuing with other indexes...');
      }
    }

    // 2. Index para categoria
    console.log('Creating category index...');
    await collection.createIndex({ category: 1 }, { name: 'idx_category' });
    console.log('✓ Category index created');

    // 3. Index para preço atual
    console.log('Creating currentPrice index...');
    await collection.createIndex({ currentPrice: 1 }, { name: 'idx_currentPrice' });
    console.log('✓ CurrentPrice index created');

    // 4. Index para desconto (descendente - maiores primeiro)
    console.log('Creating discountPercentage index...');
    await collection.createIndex({ discountPercentage: -1 }, { name: 'idx_discountPercentage' });
    console.log('✓ DiscountPercentage index created');

    // 5. Index para data de criação (descendente - mais recentes primeiro)
    console.log('Creating createdAt index...');
    await collection.createIndex({ createdAt: -1 }, { name: 'idx_createdAt' });
    console.log('✓ CreatedAt index created');

    // 6. Index para data de expiração
    console.log('Creating expiresAt index...');
    await collection.createIndex({ expiresAt: 1 }, { name: 'idx_expiresAt' });
    console.log('✓ ExpiresAt index created');

    // 7. Index para status
    console.log('Creating status index...');
    await collection.createIndex({ status: 1 }, { name: 'idx_status' });
    console.log('✓ Status index created');

    // 8. Compound index para queries comuns (categoria + desconto)
    console.log('Creating compound index (category + discount)...');
    await collection.createIndex(
      { category: 1, discountPercentage: -1 },
      { name: 'idx_category_discount' }
    );
    console.log('✓ Compound index created');

    // 9. Compound index para produtos não expirados
    console.log('Creating compound index (expiresAt + createdAt)...');
    await collection.createIndex(
      { expiresAt: 1, createdAt: -1 },
      { name: 'idx_expiresAt_createdAt' }
    );
    console.log('✓ Compound index created');

    console.log('\n✅ All product indexes created successfully!');
    
    // Mostrar todos os indexes criados
    const indexes = await collection.indexes();
    console.log('\n📋 Current product indexes:');
    indexes.forEach(idx => {
      console.log(`   - ${idx.name}`);
    });

    // ========= ALERTS INDEXES =========
    console.log('\n📊 Creating alerts indexes...\n');
    const alertsCollection = await getAlertsCollection(db);

    // 1. Index para userId (queries mais comuns)
    console.log('Creating userId index...');
    await alertsCollection.createIndex({ userId: 1 }, { name: 'idx_userId' });
    console.log('✓ UserId index created');

    // 2. Index para isActive
    console.log('Creating isActive index...');
    await alertsCollection.createIndex({ isActive: 1 }, { name: 'idx_isActive' });
    console.log('✓ IsActive index created');

    // 3. Compound index para queries de alertas ativos de um user
    console.log('Creating compound index (userId + isActive)...');
    await alertsCollection.createIndex(
      { userId: 1, isActive: 1 },
      { name: 'idx_userId_isActive' }
    );
    console.log('✓ Compound index created');

    // 4. Index para lastCheckedAt (para encontrar alertas que precisam ser verificados)
    console.log('Creating lastCheckedAt index...');
    await alertsCollection.createIndex({ lastCheckedAt: 1 }, { name: 'idx_lastCheckedAt' });
    console.log('✓ LastCheckedAt index created');

    console.log('\n✅ All alert indexes created successfully!');
    
    const alertIndexes = await alertsCollection.indexes();
    console.log('\n📋 Current alert indexes:');
    alertIndexes.forEach(idx => {
      console.log(`   - ${idx.name}`);
    });

    // ========= MESSAGES INDEXES =========
    console.log('\n📊 Creating messages indexes...\n');
    const messagesCollection = await getMessagesCollection(db);

    // 1. Compound index para histórico de mensagens de um user (mais comum)
    console.log('Creating compound index (userId + createdAt)...');
    await messagesCollection.createIndex(
      { userId: 1, createdAt: -1 },
      { name: 'idx_userId_createdAt' }
    );
    console.log('✓ Compound index created');

    // 2. Index para intentType (para analytics)
    console.log('Creating intentType index...');
    await messagesCollection.createIndex({ intentType: 1 }, { name: 'idx_intentType' });
    console.log('✓ IntentType index created');

    console.log('\n✅ All message indexes created successfully!');
    
    const messageIndexes = await messagesCollection.indexes();
    console.log('\n📋 Current message indexes:');
    messageIndexes.forEach(idx => {
      console.log(`   - ${idx.name}`);
    });

    // ========= USERS INDEXES =========
    console.log('\n📊 Creating users indexes...\n');
    const usersCollection = await getUsersCollection(db);

    // 1. Index para id (chave primária) - único
    console.log('Creating id unique index...');
    await usersCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    console.log('✓ Id unique index created');

    // 2. Index para blockedUntil (para queries de bloqueio)
    console.log('Creating blockedUntil index...');
    await usersCollection.createIndex({ blockedUntil: 1 }, { name: 'idx_blockedUntil' });
    console.log('✓ BlockedUntil index created');

    // 3. Index para isActive
    console.log('Creating isActive index...');
    await usersCollection.createIndex({ isActive: 1 }, { name: 'idx_isActive' });
    console.log('✓ IsActive index created');

    console.log('\n✅ All user indexes created successfully!');
    
    const userIndexes = await usersCollection.indexes();
    console.log('\n📋 Current user indexes:');
    userIndexes.forEach(idx => {
      console.log(`   - ${idx.name}`);
    });

    console.log('\n🎉 ALL DATABASE INDEXES CREATED SUCCESSFULLY!');
    
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    throw error;
  } finally {
    await closeConnection();
  }
};

createIndexes()
  .catch(console.error)
  .finally(() => process.exit());