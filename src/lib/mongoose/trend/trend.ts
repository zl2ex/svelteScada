import mongoose from 'mongoose';

export type Trend = {
    time: Date;
    value: number;
    unit?: string;
};

/*
export interface TrendInput extends mongoose.Document {
    value: number;
    unit?: string;
};
*/

const trendSchema = new mongoose.Schema({
    time: {
        type: Date,
        required: true
    },
    value: {
        type: Number,
        required: true
    },
    unit: {
        type: String,
        required: false
    },
});


/*
trendSchema.pre('save', async function (this: TrendInput) {
    
    this.time = Date.now();
});
*/
// WIP only overwrite if it doesnt exist

 export const TrendModel = mongoose.model('Trend', trendSchema);