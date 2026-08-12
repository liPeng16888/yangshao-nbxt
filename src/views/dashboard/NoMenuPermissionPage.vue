<template>
  <section class="panel no-menu-permission">
    <el-empty description="当前子账号尚未分配菜单权限">
      <p>请联系主账号在“账号设置”中为你分配可访问的菜单。</p>
    </el-empty>
  </section>
</template>

<style scoped>
.no-menu-permission {
  min-height: 420px;
  display: grid;
  place-items: center;
}

.no-menu-permission p {
  margin: 0;
  color: #7b8798;
}
</style>
