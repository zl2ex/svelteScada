import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

export type User = {
    username: string;
    email: string;
};

export interface UserInput extends User {
    password: string;
};

export interface UserDocument extends UserInput, mongoose.Document {
    
}

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
});



userSchema.pre('save', async function (this: UserDocument) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(this.password, salt);
    this.password = hashedPassword;
});

// WIP only overwrite if it doesnt exist

 export const UserModel = mongoose.model('User', userSchema);