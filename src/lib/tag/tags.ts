import { BaseTag_c, type BaseTag } from "./baseTag";
import './userDataTypes.ts';


export type Tags = typeof tags;

export function tagsRef() { return tags }

export let tags = {
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
};

/*
export let tags = {
	aprt01: {
		name: "aprt01",
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

	tagStoreDemo: {
		name: "tagStoreDemo",
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
};*/