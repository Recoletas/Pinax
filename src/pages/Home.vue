<template>
  <div class="home">
    <div class="home-header">
      <h1>WriterHelper</h1>
      <p>Or just a game</p>
    </div>

    <div class="enter-section">
      <router-link to="/fit" class="enter-btn">进入 拟合</router-link>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.home {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
  min-height: 80vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.home-header {
  text-align: center;
  margin-bottom: 3rem;
}

.home-header h1 {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.home-header p {
  color: var(--text-muted);
  font-size: 1.1rem;
}

.enter-section {
  text-align: center;
}

.enter-btn {
  display: inline-block;
  padding: 0.75rem 2rem;
  background: var(--accent);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 1rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.15s ease;
}

.enter-btn:hover {
  background: var(--accent-hover);
}
</style>
