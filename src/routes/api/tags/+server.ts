import { event } from 'sveltekit-sse';


function delay(milliseconds: number){
  return new Promise(function run(r){
    setTimeout(r, milliseconds)
  })
}

export function GET() {
  return event(async function run(emit){
    while (true) {
      console.log("emit");
      emit(`${Date.now()}`)
      await delay(1000)
    }
  }).toResponse()
}