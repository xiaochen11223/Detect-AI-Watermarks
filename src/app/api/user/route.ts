import { db } from "@/core/db";
import { users } from "@/db/schema";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const userList = await db().select().from(users);
    return NextResponse.json(userList);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
