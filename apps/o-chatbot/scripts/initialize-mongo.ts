import { initDatabase, closeDatabase } from '../src/storage/mongo.js';

async function main(): Promise<void> {
  console.log('Initializing MongoDB...');
  await initDatabase();
  console.log('MongoDB initialized successfully!');
  await closeDatabase();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to initialize MongoDB:', err);
  process.exit(1);
});
