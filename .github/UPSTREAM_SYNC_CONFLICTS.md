# Upstream sync requires manual resolution

- Upstream: `komari-monitor/komari-web:radix`
- Base: `cazi-cc/komari-web:radix`
- Run: https://github.com/cazi-cc/komari-web/actions/runs/34101573199

## Conflicting files

```text
src/components/admin/AdminPanelBar.tsx
src/config/menuConfig.json
src/i18n/locales/en.json
src/i18n/locales/id_ID.json
src/i18n/locales/ja_JP.json
src/i18n/locales/zh_CN.json
src/i18n/locales/zh_TW.json
src/lib/api.ts
src/pages/admin/notification/general.tsx
src/pages/admin/pingTask.tsx
src/pages/admin/pingTask_Task.tsx
src/routes.ts
src/utils/iconHelper.ts
```

## Fork-owned files to preserve

```text
.github/scripts/resolve-komari-release.cjs
.github/scripts/resolve-komari-release.test.cjs
.github/workflows/follow-komari-release.yaml
.github/workflows/release-automation-tests.yml
src/pages/admin/unlockQuality.tsx
.github/workflows/sync-upstream.yml
```

Do not merge this report-only commit. Resolve the upstream merge on this branch, delete this file, run the repository tests, and then update the pull request.
