import { logoutUser } from '$lib/server/auth/auth.js';

export async function POST(request) {
	return logoutUser(request);
}