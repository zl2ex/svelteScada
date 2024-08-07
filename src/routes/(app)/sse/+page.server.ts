import { fail } from '@sveltejs/kit';
import { tagsSSE, updateTag } from './data.server';

export function load({ depends }) {
	//depends('tags');
	return { tagsSSE };
}

export const actions = {

	async update({ request }) {
		const form = await request.formData();
		const name = form.get('name')?.toString();
		const message = form.get('message')?.toString();

		if (!name || !message) {
			return fail(400, { message: 'Name or message required!' });
		}

		updateTag({ name: name, data: {str: message}, enabled: true });
		return { user: name, sent: true };
	}
};
