import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// 测试表
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow()
});
