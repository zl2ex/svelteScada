<script lang="ts">
  import { browser } from "$app/env";
  import { todos, createTodo, removeTodo } from "$live/tag-folder";
  import { createTravels } from "travels";

  let text = $state("");
  let todosRune = todos.rune();
  let s = createTravels(todosRune, { mutable: true });

  async function create(text: string) {
    s.setState(async () => {
      const newTodo = { id: crypto.randomUUID(), text };
      const rollback = todos.optimistic("created", newTodo);
      await createTodo(newTodo).catch(() => rollback());
    });
  }

  async function remove(id: string) {
    s.setState(async () => {
      const rollback = todos.optimistic("deleted", { id });
      await removeTodo(id).catch(() => rollback());
    });
  }

  todos.enableHistory(100);
  if (browser) {
    document.addEventListener("keyup", (e) => {
      if (e.key == "z" && e.ctrlKey) {
        console.debug(`canUndo ${s.canBack()}`);
        s.back();
        //todos.undo();
      }
    });
  }
</script>

<input class="input" type="text" bind:value={text} />
<button class="btn preset-filled" onclick={() => create(text)}>send</button>

{#each todosRune.current as todo}
  <p>{todo.id} {todo.text}</p>
  <button
    onclick={() => remove(todo.id)}
    class="btn preset-filled-error-400-600">delete</button
  >
{/each}
