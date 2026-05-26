<script>
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import "../app.css"
	// `data` is whatever +layout.server.js returned -> { user: ... }
	// pulling it from props alongside `children`
	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!-- this lives in the layout, so it shows on EVERY page -->
<header>
	{#if data.user}
		<!-- logged in: data.user is the PocketBase user record -->
		<span>Logged in as {data.user.email}</span>

		<!-- logout button -->

		<form method='POST' action = "/logout">
		<button>Log Out</button>
		</form>
	{:else}
		<!-- data.user is null -> not logged in -->
		<a href="/login">Log in</a>
	{/if}
</header>

{@render children()}
<!-- the shell that wraps every page underneath it. whatever you put in it renders on every page in the app -->
 <!-- right now it has a header displaying the user -->
  <!-- think of the layout as a picture frame, and children is where the photo goes -->
