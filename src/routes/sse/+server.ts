import { tagEvent } from './data.server';

export function GET() {
	const event = new tagEvent();
	//chat_events.push(event);

	const stream = new ReadableStream({
		start(controller) {
			event.on('tag', () => {
				console.log("SSE Server Event");
				controller.enqueue('event: message\ndata:\n\n');
			});
		},
		cancel() {
			//const index = chat_events.indexOf(event);
			//if (~index) chat_events.splice(index, 1);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
