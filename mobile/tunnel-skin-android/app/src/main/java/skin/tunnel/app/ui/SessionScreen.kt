package skin.tunnel.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Keyboard
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import skin.tunnel.app.SessionMode
import skin.tunnel.app.TunnelSettings
import skin.tunnel.app.ui.theme.Ink
import skin.tunnel.app.ui.theme.Signal
import skin.tunnel.app.ui.theme.TextMuted
import skin.tunnel.app.ui.theme.TextPrimary
import skin.tunnel.app.ui.theme.Void

@Composable
fun SessionScreen(
    mode: SessionMode,
    settings: TunnelSettings,
    loading: Boolean,
    title: String?,
    chromeVisible: Boolean,
    onBack: () -> Unit,
    onToggleChrome: () -> Unit,
    onLoading: (Boolean) -> Unit,
    onTitle: (String?) -> Unit,
) {
    BackHandler(onBack = onBack)

    val termHandle = remember { WebViewHandle() }
    val config = LocalConfiguration.current
    val landscape = config.screenWidthDp > config.screenHeightDp
    val useSplitRow = mode == SessionMode.SPLIT && (landscape || config.screenWidthDp >= 700)

    Column(
        Modifier
            .fillMaxSize()
            .background(Void),
    ) {
        if (chromeVisible) {
            SessionTopBar(
                mode = mode,
                title = title,
                loading = loading,
                onBack = onBack,
                onToggleChrome = onToggleChrome,
                onReload = {
                    termHandle.webView?.reload()
                },
            )
        }

        Box(
            Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            when (mode) {
                SessionMode.DESKTOP -> {
                    TunnelWebView(
                        url = settings.desktopUrl,
                        settings = settings,
                        desktopMode = true,
                        modifier = Modifier.fillMaxSize(),
                        onLoading = onLoading,
                        onTitle = onTitle,
                    )
                }

                SessionMode.TERMINAL -> {
                    Column(Modifier.fillMaxSize()) {
                        TunnelWebView(
                            url = settings.terminalUrl,
                            settings = settings,
                            desktopMode = false,
                            handle = termHandle,
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth(),
                            onLoading = onLoading,
                            onTitle = onTitle,
                        )
                        if (settings.showTerminalExtraKeys) {
                            ExtraKeysBar(
                                handle = termHandle,
                                modifier = Modifier.navigationBarsPadding(),
                            )
                        }
                    }
                }

                SessionMode.SPLIT -> {
                    if (useSplitRow) {
                        Row(Modifier.fillMaxSize()) {
                            TunnelWebView(
                                url = settings.desktopUrl,
                                settings = settings,
                                desktopMode = true,
                                modifier = Modifier
                                    .weight(1.35f)
                                    .fillMaxHeight(),
                                onLoading = onLoading,
                                onTitle = onTitle,
                            )
                            Box(
                                Modifier
                                    .width(1.dp)
                                    .fillMaxHeight()
                                    .background(Ink),
                            )
                            Column(
                                Modifier
                                    .weight(1f)
                                    .fillMaxHeight(),
                            ) {
                                TunnelWebView(
                                    url = settings.terminalUrl,
                                    settings = settings,
                                    desktopMode = false,
                                    handle = termHandle,
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxWidth(),
                                )
                                if (settings.showTerminalExtraKeys) {
                                    ExtraKeysBar(handle = termHandle)
                                }
                            }
                        }
                    } else {
                        Column(Modifier.fillMaxSize()) {
                            TunnelWebView(
                                url = settings.desktopUrl,
                                settings = settings,
                                desktopMode = true,
                                modifier = Modifier
                                    .weight(1.1f)
                                    .fillMaxWidth(),
                                onLoading = onLoading,
                                onTitle = onTitle,
                            )
                            Box(
                                Modifier
                                    .fillMaxWidth()
                                    .background(Ink)
                                    .padding(vertical = 1.dp),
                            )
                            TunnelWebView(
                                url = settings.terminalUrl,
                                settings = settings,
                                desktopMode = false,
                                handle = termHandle,
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxWidth(),
                            )
                            if (settings.showTerminalExtraKeys) {
                                ExtraKeysBar(
                                    handle = termHandle,
                                    modifier = Modifier.navigationBarsPadding(),
                                )
                            }
                        }
                    }
                }
            }

            if (loading) {
                CircularProgressIndicator(
                    Modifier.align(Alignment.Center),
                    color = Signal,
                    strokeWidth = 2.dp,
                )
            }

            if (!chromeVisible) {
                IconButton(
                    onClick = onToggleChrome,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .statusBarsPadding()
                        .padding(8.dp)
                        .background(Ink.copy(alpha = 0.7f)),
                ) {
                    Icon(Icons.Outlined.Visibility, contentDescription = "Show chrome", tint = Signal)
                }
            }
        }
    }
}

@Composable
private fun SessionTopBar(
    mode: SessionMode,
    title: String?,
    loading: Boolean,
    onBack: () -> Unit,
    onToggleChrome: () -> Unit,
    onReload: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxWidth()
            .background(Ink)
            .statusBarsPadding(),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back", tint = TextPrimary)
            }
            Column(Modifier.weight(1f)) {
                Text(
                    text = when (mode) {
                        SessionMode.DESKTOP -> "DESKTOP"
                        SessionMode.TERMINAL -> "TERMINAL"
                        SessionMode.SPLIT -> "SPLIT ULTRA"
                    },
                    color = Signal,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 12.sp,
                )
                Text(
                    text = title ?: "tunnel.skin",
                    color = TextMuted,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (mode == SessionMode.TERMINAL || mode == SessionMode.SPLIT) {
                IconButton(onClick = onReload) {
                    Icon(Icons.Outlined.Refresh, contentDescription = "Reload", tint = TextMuted)
                }
            }
            IconButton(onClick = onToggleChrome) {
                Icon(
                    if (mode == SessionMode.DESKTOP) Icons.Outlined.VisibilityOff else Icons.Outlined.Keyboard,
                    contentDescription = "Hide chrome",
                    tint = TextMuted,
                )
            }
        }
        if (loading) {
            LinearProgressIndicator(
                Modifier.fillMaxWidth(),
                color = Signal,
                trackColor = Color.Transparent,
            )
        }
    }
}
