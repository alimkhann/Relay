package skin.tunnel.app.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import skin.tunnel.app.Defaults
import skin.tunnel.app.TunnelSettings

class SettingsRepository(context: Context) {
    private val appContext = context.applicationContext

    private val prefs by lazy {
        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            appContext,
            "tunnel_skin_secure",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun load(): TunnelSettings = TunnelSettings(
        desktopUrl = prefs.getString(KEY_DESKTOP, Defaults.DESKTOP_URL) ?: Defaults.DESKTOP_URL,
        terminalUrl = prefs.getString(KEY_TERMINAL, Defaults.TERMINAL_URL) ?: Defaults.TERMINAL_URL,
        terminalUser = prefs.getString(KEY_USER, "") ?: "",
        terminalPassword = prefs.getString(KEY_PASS, "") ?: "",
        keepScreenOn = prefs.getBoolean(KEY_KEEP_ON, true),
        immersiveDesktop = prefs.getBoolean(KEY_IMMERSIVE, true),
        showTerminalExtraKeys = prefs.getBoolean(KEY_EXTRA_KEYS, true),
        preferLandscapeDesktop = prefs.getBoolean(KEY_LANDSCAPE, true),
        desktopScale = prefs.getFloat(KEY_SCALE, 1.0f),
    )

    fun save(settings: TunnelSettings) {
        prefs.edit()
            .putString(KEY_DESKTOP, settings.desktopUrl.trim())
            .putString(KEY_TERMINAL, settings.terminalUrl.trim())
            .putString(KEY_USER, settings.terminalUser)
            .putString(KEY_PASS, settings.terminalPassword)
            .putBoolean(KEY_KEEP_ON, settings.keepScreenOn)
            .putBoolean(KEY_IMMERSIVE, settings.immersiveDesktop)
            .putBoolean(KEY_EXTRA_KEYS, settings.showTerminalExtraKeys)
            .putBoolean(KEY_LANDSCAPE, settings.preferLandscapeDesktop)
            .putFloat(KEY_SCALE, settings.desktopScale)
            .apply()
    }

    companion object {
        private const val KEY_DESKTOP = "desktop_url"
        private const val KEY_TERMINAL = "terminal_url"
        private const val KEY_USER = "term_user"
        private const val KEY_PASS = "term_pass"
        private const val KEY_KEEP_ON = "keep_on"
        private const val KEY_IMMERSIVE = "immersive"
        private const val KEY_EXTRA_KEYS = "extra_keys"
        private const val KEY_LANDSCAPE = "landscape"
        private const val KEY_SCALE = "scale"
    }
}
