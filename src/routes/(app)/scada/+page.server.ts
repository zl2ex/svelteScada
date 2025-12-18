import type { RequestEvent } from "@sveltejs/kit";

let data = 22;

export async function load() {
  return {
    data,
  };
}

export const actions = {
  update: async ({ request }: RequestEvent) => {
    const formData = await request.formData();
    data = Number(formData.get("number"));
    console.log(data);
  },
};
