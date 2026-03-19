import { initDatabase } from '../storage/mongo.js';

initDatabase()
  .then(() => {
    console.log('MongoDB initialized successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed to initialize MongoDB:', err);
    process.exit(1);
  });
