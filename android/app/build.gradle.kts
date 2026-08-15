import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing credentials are materialized into this app-relative,
// git-ignored file by tool/ci/prepare_android_release.sh (CI) or a local
// developer setup. Its absence must never break debug/local development
// tasks; only an actual release signing operation fails closed.
val keystorePropertiesFile = file("../key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    FileInputStream(keystorePropertiesFile).use { keystoreProperties.load(it) }
}

// Only an actual release signing operation requires credentials; debug and
// other local tasks must keep working without android/key.properties.
val releaseTaskRequested = gradle.startParameter.taskNames.any {
    it.contains("release", ignoreCase = true)
}

android {
    namespace = "com.calorix.calorix"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.calorix.calorix"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (releaseTaskRequested) {
                if (!keystorePropertiesFile.exists()) {
                    throw GradleException(
                        "Release build requested but android/key.properties is missing."
                    )
                }

                val storeFileValue = keystoreProperties.getProperty("storeFile")?.trim()
                val storePasswordValue = keystoreProperties.getProperty("storePassword")?.trim()
                val keyAliasValue = keystoreProperties.getProperty("keyAlias")?.trim()
                val keyPasswordValue = keystoreProperties.getProperty("keyPassword")?.trim()

                if (storeFileValue.isNullOrBlank() ||
                    storePasswordValue.isNullOrBlank() ||
                    keyAliasValue.isNullOrBlank() ||
                    keyPasswordValue.isNullOrBlank()
                ) {
                    throw GradleException(
                        "Release build requested but android/key.properties is missing one " +
                            "or more required fields: storeFile, storePassword, keyAlias, " +
                            "keyPassword."
                    )
                }

                if (!file(storeFileValue).exists()) {
                    throw GradleException(
                        "Release build requested but the keystore file referenced by " +
                            "android/key.properties does not exist."
                    )
                }

                storeFile = file(storeFileValue)
                storePassword = storePasswordValue
                keyAlias = keyAliasValue
                keyPassword = keyPasswordValue
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
