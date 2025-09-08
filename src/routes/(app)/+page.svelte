<script>
  import NumberDisplay from "$lib/componets/scada/NumberDisplay.svelte";
</script>

<h1>Home</h1>

<NumberDisplay path="/demo/test"></NumberDisplay>
<NumberDisplay path="/demo/testInt32"></NumberDisplay>
<NumberDisplay path="/demo/testInt16"></NumberDisplay>
<NumberDisplay path="/demo/testBool"></NumberDisplay>
