import { browser } from '$app/environment';

let flashToggle = $state(false);

export let flash = {
    get isOn() { return flashToggle }
}

function toggle()
{
    flashToggle = !flashToggle;
}


if(browser) setInterval(toggle, 500);