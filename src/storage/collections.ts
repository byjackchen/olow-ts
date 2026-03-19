export const COLLECTIONS = {
  CYCLES: 'cycles',
  USERS: 'users',
  SYSTEMS: 'systems',
  FAQS: 'faqs',
  TICKETS: 'tickets',
  EXTERNAL_SYSTEMS_SYNC: 'external_systems_sync',
  STATS: 'stats',
  UNMATCHED_INQUIRIES: 'unmatched_inquiries',
  SCHEDULES: 'schedules',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

export const ALL_COLLECTION_NAMES = Object.values(COLLECTIONS);
