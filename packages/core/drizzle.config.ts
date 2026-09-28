import { defineConfig } from 'drizzle-kit';

// 只用于 `drizzle-kit generate` 根据 schema 生成迁移 SQL。
// 运行时迁移由 src/migrate.ts 执行，不依赖此文件。
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema.ts',
  out: './drizzle',
});
