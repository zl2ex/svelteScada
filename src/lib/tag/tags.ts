import { BaseTag_c, type BaseTag } from "./baseTag";
import './userDataTypes.ts';


export type Tags = typeof tagsInit;

/*
export let tagsInit = {
	aprt01: new BaseTag_c<DigitalIn>({
		name: "aprt01",
		data: {
			value: false,
			fault: false
		}
	}),

	aprt02: new BaseTag_c<DigitalIn>({
		name: "aprt02",
		data: {
			value: false,
			fault: false
		}
	}),

	attx01: new BaseTag_c<AnalogIn>({
		name: "attx01",
		data: {
			value: 1001,
			fault: false,
			scaling: {
				inMin: 0,
				inMax: 1023,
				outMin: 0,
				outMax: 100
			}
		}
	})
};*/


export let tagsInit = {
	aprt01: {
		name: "aprt01",
		path: "EIP/PLC/{name}",
		data: {
			value: false,
			fault: false
		},
		enabled: true
	} as BaseTag<DigitalIn>,

	aprt02: {
		name: "aprt02",
		data: {
			value: false,
			fault: false
		},
		enabled: true
	} as BaseTag<DigitalIn>,

	attx01: {
		name: "attx01",
		data: {
			value: 1001,
			fault: false,
			scaling: {
				inMin: 0,
				inMax: 1023,
				outMin: 0,
				outMax: 100
			}
		},
		enabled: true
	} as BaseTag<AnalogIn>,

	tagArray: {
		name: "tagArray",
		data: {
			value: [1, 2, 3, 4, 5]
		},
		enabled: true
	} as BaseTag<NumArr>,
};