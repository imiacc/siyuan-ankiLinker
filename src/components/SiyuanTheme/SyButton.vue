<template>
  <button
    class="b3-button b3-button--outline fn__flex-center fn__size200"
    :type="type"
  >
    <slot>Button</slot>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  type?: 'button' | 'submit' | 'reset'
}>()
</script>
