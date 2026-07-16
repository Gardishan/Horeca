# HoReCa KZ Android wrapper

Минимальный Android WebView-клиент для веб-приложения. В проекте намеренно нет JavaScript bridge: это уменьшает поверхность атаки, а сессия работает через обычные защищённые cookie.

## Запуск из Android Studio

1. Откройте папку `android` в Android Studio.
2. Дождитесь синхронизации Gradle и создайте эмулятор API 35+.
3. Для локального Next.js передайте Gradle property `webAppUrl=http://10.0.2.2:3000`.
4. Запустите конфигурацию `app`.

## Debug APK

Если Gradle wrapper ещё не создан, выполните в папке `android` команду `gradle wrapper`, затем:

```bash
./gradlew assembleDebug -PwebAppUrl=http://10.0.2.2:3000
```

APK появится в `android/app/build/outputs/apk/debug/app-debug.apk`.

Для production используйте HTTPS URL:

```bash
./gradlew assembleRelease -PwebAppUrl=https://horeca.kz
```

Перед публикацией настройте signing config, иконки, deep links, Firebase Crashlytics и политику обновления WebView.

