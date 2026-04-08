/**
 * Console 日志劫持模块（已废弃）
 *
 * @deprecated v0.1.4 — 日志采集已迁移至主进程 cdp-log-listener.ts，
 * 通过 Chrome DevTools Protocol (CDP) Runtime.consoleAPICalled
 * 实现零侵入式被动监听。此文件保留为空壳占位函数以兼容历史引用。
 */
export function initConsoleHijacker(): void {
    /* 不再劫持 console.* / cc.* — CDP listener 在主进程接管 */
}

