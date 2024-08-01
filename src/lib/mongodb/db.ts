import { MongoClient } from 'mongodb';
import { MONGODB_URL } from '$env/static/private'; 



const client = new MongoClient(MONGODB_URL);

export async function connectToDatabase() 
{
	await client.connect();
	console.log(`Successfully connected to database`);
}

export default client.db();