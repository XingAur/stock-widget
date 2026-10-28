<template>
  <section class="company-card">
    <header class="cl-section-head cl-section-head--lg company-head">
      公司资料
      <span v-if="profile?.fullName" class="cl-section-head__sub">{{ profile.fullName }}</span>
    </header>

    <div v-if="loading && !profile" class="cl-empty company-state"><span class="cl-spinner"></span>正在读取公司资料...</div>
    <div v-else-if="!profile" class="cl-empty company-state">{{ error || '暂无公司资料' }}</div>
    <template v-else>
      <div class="company-block">
        <h4>所属板块</h4>
        <div v-if="profile.boards.length" class="board-tags">
          <span v-for="board in profile.boards" :key="board" class="cl-tag">{{ board }}</span>
        </div>
        <p v-else class="cl-hint">暂无板块数据</p>
      </div>

      <dl v-if="facts.length" class="company-facts">
        <template v-for="fact in facts" :key="fact.label">
          <dt>{{ fact.label }}</dt>
          <dd>{{ fact.value }}</dd>
        </template>
      </dl>

      <div v-if="intro" class="company-block">
        <h4>公司简介</h4>
        <p class="company-intro" :class="{ expanded: introExpanded }">{{ intro }}</p>
        <button v-if="intro.length > 90" class="cl-btn cl-btn--ghost cl-btn--sm intro-toggle" type="button" @click="introExpanded = !introExpanded">
          {{ introExpanded ? '收起' : '展开全部' }}
        </button>
      </div>

      <div class="company-block">
        <h4>最新公告</h4>
        <ul v-if="profile.announcements.length" class="notice-list cl-divided">
          <li v-for="notice in profile.announcements" :key="notice.url">
            <button class="notice-item" type="button" :title="`${notice.title}\n点击在浏览器中查看原文`" @click="openNotice(notice.url)">
              <span class="notice-date">{{ notice.date.slice(5) }}</span>
              <span class="notice-title">{{ notice.title }}</span>
              <span v-if="notice.category" class="cl-tag notice-category">{{ notice.category }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="cl-hint">暂无公告</p>
        <p v-if="openError" class="cl-hint open-error">{{ openError }}</p>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { openExternalUrl, type StockProfile } from '../../api/stock'

const props = defineProps<{
  profile: StockProfile | null
  loading: boolean
  error: string
}>()

const introExpanded = ref(false)
const openError = ref('')

watch(() => props.profile?.code, () => {
  introExpanded.value = false
  openError.value = ''
})

const facts = computed(() => {
  const profile = props.profile
  if (!profile) return []
  return [
    { label: '所属行业', value: profile.industry },
    { label: '所在地区', value: profile.region },
    { label: '上市日期', value: profile.listingDate }
  ].filter((fact) => fact.value)
})

const intro = computed(() => props.profile?.mainBusiness || props.profile?.profile || '')

async function openNotice(url: string) {
  openError.value = ''
  try {
    await openExternalUrl(url)
  } catch (error) {
    openError.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<style scoped>
.company-card{flex-shrink:0;display:flex;flex-direction:column;gap:12px;margin-top:12px;padding-top:12px;border-top:1px solid var(--divider-color)}
.company-head{margin:0}
.company-state{flex-direction:row;min-height:96px}
.company-block{display:flex;flex-direction:column;gap:6px;min-width:0}
.company-block h4{margin:0;font-size:var(--fs-sm);font-weight:700;color:var(--text-secondary)}
.board-tags{display:flex;flex-wrap:wrap;gap:6px}
.board-tags .cl-tag{height:22px;font-size:var(--fs-xs)}
.company-facts{display:grid;grid-template-columns:repeat(3,auto 1fr);gap:4px 10px;margin:0;font-size:var(--fs-sm)}
.company-facts dt{color:var(--text-muted);white-space:nowrap}
.company-facts dd{margin:0;color:var(--text-primary);font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.company-intro{margin:0;font-size:var(--fs-sm);line-height:1.65;color:var(--text-primary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line}
.company-intro.expanded{display:block}
.intro-toggle{align-self:flex-start;padding:0 6px}
.notice-list{list-style:none;margin:0;padding:0}
.notice-item{width:100%;display:flex;align-items:center;gap:10px;padding:7px 4px;border:0;border-radius:var(--radius-xs);background:transparent;color:var(--text-primary);font:inherit;font-size:var(--fs-sm);text-align:left;cursor:pointer;transition:background var(--ease)}
.notice-item:hover{background:var(--surface-2)}
.notice-item:hover .notice-title{color:var(--accent-text)}
.notice-date{flex:0 0 auto;color:var(--text-muted);font-variant-numeric:tabular-nums}
.notice-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.notice-category{flex:0 0 auto;height:20px;font-size:10px}
.open-error{color:var(--fall)}
@media (max-width:720px){.company-facts{grid-template-columns:auto 1fr}.notice-category{display:none}}
</style>
