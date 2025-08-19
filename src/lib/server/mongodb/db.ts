import { MongoClient } from 'mongodb';
import { logger } from '../../pino/logger';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URL = process.env.MONGODB_URL;

const client = new MongoClient(MONGODB_URL);

export async function connectToDatabase()
{
	await client.connect().catch((reason) => {
		logger.error(reason);
	});
	logger.info("Successfully connected to mongodb database ");
}

export default client.db();