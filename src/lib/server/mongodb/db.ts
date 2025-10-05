import { MongoClient } from "mongodb";
import { logger } from "../pino/logger";
import dotenv from "dotenv";
dotenv.config();

const MONGODB_URL = process.env.MONGODB_URL;

export const mongoClient = new MongoClient(MONGODB_URL);

export const db = mongoClient.db();

export async function connectToDatabase() {
  await mongoClient.connect().catch((reason) => {
    logger.error(reason);
  });
  logger.info("Successfully connected to mongodb database ");
}
