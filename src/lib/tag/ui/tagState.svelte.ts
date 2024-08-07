import { getContext, setContext } from "svelte";

export class TagState {
    constructor() {

    }


}

let TAG_KEY = Symbol("TAG_KEY");

export function setTagState(init : TagState) {
    return setContext(TAG_KEY, init);
}

export function getTagState() {
    return getContext<ReturnType<typeof setTagState>>(TAG_KEY);
}