import { db } from "./db";

export class User {
  constructor(
    public email: string,
    public password: string
  ) {}
}

export const users = db.collection<User>("users");
await users.createIndex({ email: 1 }, { unique: true });
