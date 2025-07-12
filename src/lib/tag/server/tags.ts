import type { BaseTag } from "./baseTag";

export let tagsInit = {


	aprt01: {
		name: "aprt01",
		data: { 
			value: false,
			fault: false
		}
	} as BaseTag<DigitalIn>, 
	aprt02: {
		name: "aprt02",
		data: { 
			value: false,
			fault: false
		}
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
		}
	} as BaseTag<AnalogIn>

	/*
	aprt01: new BaseTagServer<DigitalIn>({
		name: "aprt01",
		path: "MODBUS.40000",
		data: {
			value: false,
			fault: false
		}
	}),

	aprt02: new BaseTagServer<DigitalIn>({
		name: "aprt02",
		path: "MODBUS.40000",
		data: {
			value: false,
			fault: false
		}
	}),

	attx01: new BaseTagServer<AnalogIn>({
		name: "attx01",
		path: "MODBUS.40000",
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
	})*/
};
