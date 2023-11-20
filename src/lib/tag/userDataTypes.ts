type DigitalIn = {
    value: boolean;
    fault: boolean;
};

type Scaling = {
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number
};

type AnalogIn = {
    value: number,
    scaling: Scaling,
    fault: boolean
};

type Num = {
    value: number;
};