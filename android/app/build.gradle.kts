plugins {
    id("com.android.application")
}

android {
    namespace = "kz.horeca.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "kz.horeca.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        val webAppUrl = providers.gradleProperty("webAppUrl").orElse("https://horeca.kz")
        buildConfigField("String", "WEB_APP_URL", "\"${webAppUrl.get()}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

