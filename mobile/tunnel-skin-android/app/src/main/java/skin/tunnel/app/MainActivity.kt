package skin.tunnel.app

import android.annotation.SuppressLint
import android.content.pm.ActivityInfo
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import skin.tunnel.app.data.SettingsRepository
import skin.tunnel.app.ui.HomeScreen
import skin.tunnel.app.ui.SessionScreen
import skin.tunnel.app.ui.SettingsScreen
import skin.tunnel.app.ui.theme.TunnelTheme
import skin.tunnel.app.ui.theme.Void

class MainActivity : ComponentActivity() {
    @SuppressLint("SourceLockedOrientationActivity")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val repo = SettingsRepository(this)
        val deepLinkMode = when (intent?.data?.host) {
            "desktop.tunnel.skin" -> SessionMode.DESKTOP
            "term.tunnel.skin" -> SessionMode.TERMINAL
            else -> null
        }

        setContent {
            val vm: TunnelViewModel = viewModel(factory = TunnelViewModel.factory(repo))
            val state by vm.state.collectAsStateWithLifecycle()
            var showSettings by remember { mutableStateOf(false) }

            DisposableEffect(deepLinkMode) {
                if (deepLinkMode != null) {
                    vm.open(deepLinkMode)
                }
                onDispose { }
            }

            DisposableEffect(
                state.mode,
                state.settings.keepScreenOn,
                state.settings.preferLandscapeDesktop,
                state.chromeVisible,
            ) {
                if (state.settings.keepScreenOn && state.mode != null) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }

                requestedOrientation = when {
                    state.mode == SessionMode.DESKTOP && state.settings.preferLandscapeDesktop ->
                        ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    state.mode == SessionMode.SPLIT ->
                        ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    else -> ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                }

                val controller = WindowInsetsControllerCompat(window, window.decorView)
                if (state.mode == SessionMode.DESKTOP &&
                    state.settings.immersiveDesktop &&
                    !state.chromeVisible
                ) {
                    controller.systemBarsBehavior =
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                    controller.hide(WindowInsetsCompat.Type.systemBars())
                } else {
                    controller.show(WindowInsetsCompat.Type.systemBars())
                }

                onDispose {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                    controller.show(WindowInsetsCompat.Type.systemBars())
                }
            }

            TunnelTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = Void) {
                    Crossfade(
                        targetState = when {
                            showSettings -> "settings"
                            state.mode != null -> "session"
                            else -> "home"
                        },
                        label = "root",
                    ) { screen ->
                        when (screen) {
                            "settings" -> SettingsScreen(
                                settings = state.settings,
                                onBack = { showSettings = false },
                                onSave = { next -> vm.updateSettings { next } },
                            )

                            "session" -> {
                                val mode = state.mode
                                if (mode != null) {
                                    SessionScreen(
                                        mode = mode,
                                        settings = state.settings,
                                        loading = state.loading,
                                        title = state.title,
                                        chromeVisible = state.chromeVisible,
                                        onBack = { vm.closeSession() },
                                        onToggleChrome = { vm.toggleChrome() },
                                        onLoading = vm::setLoading,
                                        onTitle = vm::setTitle,
                                    )
                                }
                            }

                            else -> HomeScreen(
                                settings = state.settings,
                                onOpen = vm::open,
                                onSettings = { showSettings = true },
                            )
                        }
                    }
                }
            }
        }
    }
}
