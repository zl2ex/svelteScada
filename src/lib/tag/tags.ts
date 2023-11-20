import type { BaseTag } from "./baseTag.ts";
import './userDataTypes.ts';

export type Tags = typeof tags;

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
};