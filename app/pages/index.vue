<template>
    <div class="grow container mx-auto space-y-8">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatisticalAnalysisTotalCard :number="24850" icon="lucide:wallet" name="总消费金额" />
            <StatisticalAnalysisTotalCard :number="24850" icon="solar:cpu-line-duotone" name="token 总消耗数量" />
            <StatisticalAnalysisTotalCard :number="24850" icon="lucide:wallet" name="缓存命中占比" />
            <StatisticalAnalysisTotalCard :number="24850" icon="lucide:wallet" name="平均单次会话成本" />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>活跃使用度 https://blocks.so/stats [Plan overview]</div>
            <div>模型使用率 https://preview.keenthemes.com/metronic8/demo55/ [Stats by Department]</div>
            <div>消息</div>
        </div>
        <div class="">
            <span>每日消费趋势</span>
            <span />
        </div>
        <StatisticalAnalysisTokensUsage />
    </div>
</template>

<script lang="ts" setup>
</script>

<style scoped>

</style>
