#!/usr/bin/env -S npx ts-node

import * as dotenv from 'dotenv';
import path from 'path';
import { existsSync } from 'fs';
import { connectToDatabase, closeConnection, getProductsCollection, getMessagesCollection, getUsersCollection } from '../index';

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

    const dropIndexIfExists = async (collectionName: string, indexName: string): Promise<void> => {
      try {
        await db.collection(collectionName).dropIndex(indexName);
        console.log(`✓ Dropped obsolete index ${collectionName}.${indexName}`);
      } catch (error: any) {
        if (error.code === 27 || error.message?.includes('index not found')) {
          console.log(`✓ Obsolete index ${collectionName}.${indexName} not present`);
          return;
        }

        // NamespaceNotFound means collection does not exist yet.
        if (error.code === 26 || error.message?.includes('ns not found')) {
          console.log(`✓ Collection ${collectionName} not found, skip dropping ${indexName}`);
          return;
        }

        console.log(`⚠️  Could not drop obsolete index ${collectionName}.${indexName}:`, error.message);
      }
    };

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

    // Limpeza de índices obsoletos
    await dropIndexIfExists('products', 'idx_status');
    await dropIndexIfExists('messages', 'idx_userId_createdAt');
    await dropIndexIfExists('messages', 'idx_intentType');
    await dropIndexIfExists('users', 'idx_blockedUntil');
    await dropIndexIfExists('users', 'idx_isActive');
    await dropIndexIfExists('alerts', 'idx_userId');
    await dropIndexIfExists('alerts', 'idx_isActive');
    await dropIndexIfExists('alerts', 'idx_userId_isActive');
    await dropIndexIfExists('alerts', 'idx_lastCheckedAt');

    // 1. Text index para pesquisa orgânica (APENAS no título)
    console.log('Creating text search index...');
    try {
      await collection.createIndex(
        {
          title: 'text',
        },
        {
          name: 'product_text_search',
          collation: { locale: 'simple' }, // Override collection collation para text index
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

    // 7. Compound index para queries comuns (categoria + desconto)
    console.log('Creating compound index (category + discount)...');
    await collection.createIndex({ category: 1, discountPercentage: -1 }, { name: 'idx_category_discount' });
    console.log('✓ Compound index created');

    // 8. Compound index para produtos não expirados
    console.log('Creating compound index (expiresAt + createdAt)...');
    await collection.createIndex({ expiresAt: 1, createdAt: -1 }, { name: 'idx_expiresAt_createdAt' });
    console.log('✓ Compound index created');

    // 8b. Index para discountLevel (usado nos filtros de notificação)
    console.log('Creating discountLevel index...');
    await collection.createIndex({ discountLevel: 1 }, { name: 'idx_discountLevel' });
    console.log('✓ DiscountLevel index created');

    // 9. Vector Search index (MongoDB Atlas Search)
    console.log('Creating vector search index...');
    const vectorDimensionsRaw = process.env.MONGODB_VECTOR_DIMENSIONS;
    const vectorIndexName = process.env.MONGODB_VECTOR_INDEX_NAME || 'product_vector_search';
    const vectorFieldPath = process.env.MONGODB_VECTOR_FIELD_PATH || 'embedding';
    const vectorSimilarity = process.env.MONGODB_VECTOR_SIMILARITY || 'cosine';

    if (!vectorDimensionsRaw) {
      console.log('⚠️  Skipping vector index: set MONGODB_VECTOR_DIMENSIONS to enable vectorSearch index creation');
    } else {
      const vectorDimensions = Number.parseInt(vectorDimensionsRaw, 10);

      if (!Number.isFinite(vectorDimensions) || vectorDimensions <= 0) {
        console.log(`⚠️  Invalid MONGODB_VECTOR_DIMENSIONS: "${vectorDimensionsRaw}". Skipping vector index.`);
      } else {
        const hasSearchIndexCommands = async (): Promise<boolean> => {
          try {
            const adminDb = db.admin();
            const commandsResponse = await adminDb.command({ listCommands: 1 });
            const commands = commandsResponse?.commands || {};
            return Boolean(commands.createSearchIndexes && commands.updateSearchIndex && commands.listSearchIndexes);
          } catch {
            return false;
          }
        };

        const searchCommandsSupported = await hasSearchIndexCommands();
        if (!searchCommandsSupported) {
          console.log('⚠️  Skipping vector index: this MongoDB deployment does not support Atlas Search commands.');
          console.log('  Use MongoDB Atlas (with Search enabled) to create and run vectorSearch indexes.');
          console.log('  Continuing with other indexes...');
        } else {
          const vectorDefinition = {
            fields: [
              {
                type: 'vector',
                path: vectorFieldPath,
                numDimensions: vectorDimensions,
                similarity: vectorSimilarity,
              },
            ],
          };

          try {
            const existingVectorIndexes = await db.command({
              listSearchIndexes: 'products',
              name: vectorIndexName,
            });

            const hasVectorIndex = Array.isArray(existingVectorIndexes?.indexes) && existingVectorIndexes.indexes.length > 0;

            if (hasVectorIndex) {
              await db.command({
                updateSearchIndex: 'products',
                name: vectorIndexName,
                definition: vectorDefinition,
              });
              console.log('✓ Vector search index updated');
            } else {
              await db.command({
                createSearchIndexes: 'products',
                indexes: [
                  {
                    name: vectorIndexName,
                    type: 'vectorSearch',
                    definition: vectorDefinition,
                  },
                ],
              });
              console.log('✓ Vector search index created');
            }
          } catch (error: any) {
            if (error.message?.includes('already exists') || error.message?.includes('Index already exists')) {
              console.log('✓ Vector search index already exists');
            } else if (error.code === 59 || error.message?.toLowerCase().includes('command not found')) {
              console.log('⚠️  Skipping vector index: server does not support Atlas Search commands.');
              console.log('  Use MongoDB Atlas Search for vector indexes.');
            } else {
              console.error('⚠️  Could not create/update vector search index:', error.message);
              console.log('  Continuing with other indexes...');
            }
          }
        }
      }
    }

    console.log('\n✅ All product indexes created successfully!');

    // Mostrar todos os indexes criados
    const indexes = await collection.indexes();
    console.log('\n📋 Current product indexes:');
    indexes.forEach(idx => {
      console.log(`   - ${idx.name}`);
    });

    // ========= MESSAGES INDEXES =========
    console.log('\n📊 Creating messages indexes...\n');
    const messagesCollection = await getMessagesCollection(db);

    // 1. Compound index para buscar mensagens por user e estado de processamento
    console.log('Creating compound index (userId + processed)...');
    await messagesCollection.createIndex({ userId: 1, processed: 1 }, { name: 'idx_userId_processed' });
    console.log('✓ Compound index created');

    // 2. Index único para id de mensagem
    console.log('Creating id unique index...');
    await messagesCollection.createIndex({ id: 1 }, { name: 'idx_id', unique: true });
    console.log('✓ Id unique index created');

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
