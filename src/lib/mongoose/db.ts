import mongoose from "mongoose";
import { MONGODB_URL } from "$env/static/private";


export async function dataBaseConnect()
{
    await mongoose.connect(MONGODB_URL);
}