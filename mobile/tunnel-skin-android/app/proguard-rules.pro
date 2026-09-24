# Keep WebView / crypto classes
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**
