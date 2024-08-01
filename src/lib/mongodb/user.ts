import db from '$lib/mongodb/db';

export class User
{
    constructor(public email:string,
                public password:string) {};
}

export const users = db.collection<User>('users');