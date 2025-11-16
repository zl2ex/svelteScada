import pino from "pino";
import pretty from "pino-pretty";
import pinoCaller from "pino-caller";

//export const logger = pinoCaller(pino({ level: "debug" }, pretty()));
export const logger = pino({ level: "trace" }, pretty());

/*export const logger = pino({
      // ... other pino options (e.g., level, redact)
      mixin() {
        // Get the stack trace
        const error = new Error();
        const stack = error.stack.split('\n');

        // Find the line that points to the caller of the logger function
        // This might need adjustment based on your project's structure
        const callerLine = stack.find(line => !line.includes('pino') && !line.includes('node_modules') && line.includes(process.cwd()));

        if (callerLine) {
          // Extract file path and line number
          const match = callerLine.match(/\((.*):(\d+):(\d+)\)/) || callerLine.match(/at (.*):(\d+):(\d+)/);
          if (match) {
            const filePath = match[1];
            const lineNumber = match[2];
            return {
              file: path.relative(process.cwd(), filePath), // Relative path for cleaner logs
              line: lineNumber,
            };
          }
        }
        return {}; // Return empty object if unable to find caller info
      },
      transport: {
        target: 'pino-pretty', // Use pino-pretty for readable output
        options: {
          colorize: true,
          // Include 'file' and 'line' in the prettyPrint output
          messageFormat: '{file}:{line} {msg}',
          ignore: 'pid,hostname', // Customize ignored properties as needed
        },
      },
    });*/
