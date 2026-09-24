package skin.tunnel.app

data class TunnelSettings(
    val desktopUrl: String = Defaults.DESKTOP_URL,
    val terminalUrl: String = Defaults.TERMINAL_URL,
    val terminalUser: String = "",
    val terminalPassword: String = "",
    val keepScreenOn: Boolean = true,
    val immersiveDesktop: Boolean = true,
    val showTerminalExtraKeys: Boolean = true,
    val preferLandscapeDesktop: Boolean = true,
    val desktopScale: Float = 1.0f,
)

object Defaults {
    const val DESKTOP_URL = "https://desktop.tunnel.skin/"
    const val TERMINAL_URL = "https://term.tunnel.skin/"
}

enum class SessionMode {
    DESKTOP,
    TERMINAL,
    SPLIT,
}
