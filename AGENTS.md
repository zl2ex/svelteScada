## Dev environment tips

use `npm run check` to run typecheck's
check the docs for the svelte-realtime libary at `https://svelte-realtime.dev/docs`

## Code style

use neverthrow ok() and err() whenever a function could possibly fail.
when using neverthrow err() keep this structure `err({reason: "ERROR_NAME", cause: `description of error`} as const satisfies NeverThrowError)` or A custom error type that extends NeverThrowError
use $lib/uitl/attempt.ts `const result = attempt(() => func)` where func is a function that is some external libary code that could throw an Error
when calling functions that return neverthrow's ok() or err() first check if there is an error with `if(result.isErr()) { return err(result.error);}` then use the result.value below
function return types not needed when using neverthrow ok() and err() because they are inferred by typescript
exception: keep the explicit return type on svelte-realtime $live functions (live streams, live queries and any function they call) because svelte-realtime parses the return type textually to generate the $types.d.ts declarations for $live/* imports
