## Dev environment tips

use `npm run check` to run typecheck's

## Code style

use neverthrow ok() and err() whenever a function could possibly fail.
when using neverthrow err() keep this structure `err({reason: "ERROR_NAME", cause: `description of error`} as const satisfies NeverThrowError)`
use $lib/uitl/attempt.ts `const result = attempt(() => func)` where func is a function that is some external libary code that could throw an Error
when calling functions that return neverthrow's ok() or err() first check if there is an error with `if(result.isErr()) { return err(result.error);}` then use the result.value below
function return types not needed when using neverthrow ok() and err() because they are inferred by typescript
