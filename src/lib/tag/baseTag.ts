type DigitalIn = {
    value: boolean;
    fault: boolean;
};

type BaseTag<type> = {
    name: string;
    data: type;
    enabled: boolean;
};