import {sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const astraCache=sqliteTable('astra_cache',{id:text('id').primaryKey(),payload:text('payload').notNull()});

export const electionSnapshots=sqliteTable('election_snapshots',{id:text('id').primaryKey(),fetchedAt:text('fetched_at').notNull(),payload:text('payload').notNull()});
