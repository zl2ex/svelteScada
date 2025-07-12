import { MongoClient } from 'mongodb';
import { MONGODB_URL } from '$env/static/private'; 
import { logger } from '$lib/pino/logger';

const client = new MongoClient(MONGODB_URL);

export async function connectToDatabase() 
{
	await client.connect().catch((reason) => {
		logger.error(reason);
	});
	logger.info("Successfully connected to mongodb database ");
}

export default client.db();