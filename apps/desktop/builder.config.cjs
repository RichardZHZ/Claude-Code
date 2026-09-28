// electron-builder 配置。由 scripts/package.mjs 调用，应用内容先整理到 .stage/。
/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'io.github.richardzhz.researchpilot',
  productName: '科研小助理',
  directories: { app: '.stage', output: 'release', buildResources: 'build' },
  // 原生模块的 C 源码只在编译时需要。
  files: ['**/*', '!node_modules/better-sqlite3/{src,deps,binding.gyp}'],
  // 不打成 asar：服务作为子进程运行，要直接读页面文件、迁移 SQL 和原生模块。
  asar: false,
  // better-sqlite3 用自带的 N-API 预编译文件，不需要重新编译。
  npmRebuild: false,
  electronLanguages: ['zh_CN', 'en'],
  artifactName: 'ResearchPilot-${version}-${arch}.${ext}',
  mac: {
    target: 'dmg',
    category: 'public.app-category.productivity',
    icon: 'build/icon.png',
    // 没有 Apple 开发者证书，用 ad-hoc 签名，Apple 芯片的 Mac 才能运行。
    identity: '-',
    hardenedRuntime: false,
  },
  dmg: { title: '科研小助理 ${version}' },
  linux: { target: 'dir', icon: 'build/icon.png', category: 'Office' },
};
