<script>
  let { form } = $props();   // the `form` prop = whatever your action returns on fail()
</script>

<form method="POST">
  <!-- email input, name="email" -->
   <input type = 'email' name = "email">
  <!-- password input, type=password, name="password" -->
   <input type = "password" name = "password">      
  <!-- submit button -->
   <button type = "submit">Log in</button>
</form>

<!-- if form?.error exists, show it -->
{#if form?.error}
  <p>{form.error}</p>
{/if}
