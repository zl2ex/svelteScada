<script lang="ts" module>
  import RemoteFormComponet from "./RemoteForm.svelte";
  import Container from "./Container.svelte";
  import Text from "./TextInput.svelte";
  import Select from "./SelectInput.svelte";

  // 2. Attach them to a dummy object or a namespace object matching the main component
  const RemoteForm = RemoteFormComponet as any;
  RemoteForm.Container = Container;
  RemoteForm.Text = Text;
  RemoteForm.Select = Select;
</script>
