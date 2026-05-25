<template>
    <SidebarProvider :default-open="false">
        <SiteAppSidebar />
        <SidebarInset class="bg-sidebar py-3 mx-4 lg:mx-0 lg:me-3 h-full min-h-0 overflow-hidden">
            <div class="relative flex min-h-0 flex-1 gap-3 overflow-hidden">
                <slot />
            </div>
        </SidebarInset>
    </SidebarProvider>
</template>

<script lang="ts" setup>

</script>

<style scoped>

</style>
