export default {
  // Стандартный preset проверяет ошибки CSS и общепринятые безопасные соглашения.
  extends: ["stylelint-config-standard"],
  // Сгенерированные стили, сборка и отчёты не являются исходным CSS приложения.
  ignoreFiles: [
    "**/node_modules/**",
    "**/dist/**",
    "**/playwright-report/**",
    "**/test-results/**",
    "**/blob-report/**",
    "**/coverage/**",
    "**/*.generated.css",
  ],
  // Неиспользуемые комментарии stylelint-disable считаются ошибкой и должны удаляться.
  reportNeedlessDisables: true,
  // Подавление неизвестного правила считается ошибкой, чтобы опечатки не скрывали нарушения.
  reportInvalidScopeDisables: true,
};
