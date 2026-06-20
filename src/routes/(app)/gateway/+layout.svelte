<script lang="ts">
  import { CpuIcon, HouseIcon, TagIcon } from "@lucide/svelte";
  import { Navigation } from "@skeletonlabs/skeleton-svelte";

  const { children, data } = $props();

  let menuOpen = $state(false);
  function closeMenu() {
    menuOpen = false;
  }

  const links = [
    { label: "Home", href: "/", icon: HouseIcon },
    { label: "Editor", href: "/editor/", icon: TagIcon },
    { label: "Edit Devices", href: "/gateway/devices", icon: CpuIcon },
  ];
</script>

<div>
  <section
    class=" grid grid-cols-[auto_1fr] items-stretch border-t border-surface-200-800"
  >
    <!-- --- -->
    <Navigation layout="sidebar">
      <Navigation.Content>
        <Navigation.Header>
          <Navigation.Trigger onclick={() => {}}></Navigation.Trigger>
        </Navigation.Header>
        <Navigation.Menu>
          {#each links as link}
            {@const Icon = link.icon}
            <Navigation.TriggerAnchor href={link.href}>
              <Icon class="size-4" />
              <Navigation.TriggerText>{link.label}</Navigation.TriggerText>
            </Navigation.TriggerAnchor>
          {/each}
        </Navigation.Menu>
      </Navigation.Content>
    </Navigation>
    <!-- --- -->
    <main>
      {@render children()}
    </main>
  </section>
</div>
