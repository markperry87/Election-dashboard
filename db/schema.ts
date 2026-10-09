import {sqliteTable,text} from 'drizzle-orm/sqlite-core';
export const astraCache=sqliteTable('astra_cache',{id:text('id').primaryKey(),payload:text('payload').notNull()});
