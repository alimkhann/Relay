package skin.tunnel.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DesktopWindows
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material.icons.outlined.ViewColumn
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import skin.tunnel.app.SessionMode
import skin.tunnel.app.TunnelSettings
import skin.tunnel.app.ui.theme.Ink
import skin.tunnel.app.ui.theme.Line
import skin.tunnel.app.ui.theme.Panel
import skin.tunnel.app.ui.theme.Signal
import skin.tunnel.app.ui.theme.SignalDim
import skin.tunnel.app.ui.theme.TextMuted
import skin.tunnel.app.ui.theme.TextPrimary
import skin.tunnel.app.ui.theme.Void

@Composable
fun HomeScreen(
    settings: TunnelSettings,
    onOpen: (SessionMode) -> Unit,
    onSettings: () -> Unit,
) {
    var show by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(80)
        show = true
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Void, Ink, Void),
                ),
            ),
    ) {
        // Subtle radial atmosphere — not flat, not purple glow spam.
        Box(
            Modifier
                .align(Alignment.TopCenter)
                .padding(top = 120.dp)
                .size(280.dp)
                .background(
                    Brush.radialGradient(
                        colors = listOf(Signal.copy(alpha = 0.10f), Void.copy(alpha = 0f)),
                    ),
                    shape = CircleShape,
                ),
        )

        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp),
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "OPERATOR",
                    style = androidx.compose.material3.MaterialTheme.typography.labelLarge,
                )
                IconButton(onClick = onSettings) {
                    Icon(Icons.Outlined.Settings, contentDescription = "Settings", tint = TextMuted)
                }
            }

            Spacer(Modifier.height(48.dp))

            AnimatedVisibility(
                visible = show,
                enter = fadeIn() + slideInVertically { it / 6 },
                exit = fadeOut(),
            ) {
                Column {
                    Text(
                        text = "tunnel.skin",
                        fontSize = 44.sp,
                        fontWeight = FontWeight.Black,
                        color = TextPrimary,
                        letterSpacing = (-1.2).sp,
                        fontFamily = FontFamily.SansSerif,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        text = "Controle o terminal e o desktop no Galaxy S25 Ultra.",
                        color = TextMuted,
                        fontSize = 16.sp,
                        lineHeight = 22.sp,
                    )
                }
            }

            Spacer(Modifier.height(40.dp))

            AnimatedVisibility(visible = show, enter = fadeIn()) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    ModeLaunch(
                        title = "Desktop",
                        subtitle = hostLabel(settings.desktopUrl),
                        icon = Icons.Outlined.DesktopWindows,
                        onClick = { onOpen(SessionMode.DESKTOP) },
                    )
                    ModeLaunch(
                        title = "Terminal",
                        subtitle = hostLabel(settings.terminalUrl),
                        icon = Icons.Outlined.Terminal,
                        onClick = { onOpen(SessionMode.TERMINAL) },
                    )
                    ModeLaunch(
                        title = "Split Ultra",
                        subtitle = "Desktop + terminal lado a lado (19.5:9)",
                        icon = Icons.Outlined.ViewColumn,
                        onClick = { onOpen(SessionMode.SPLIT) },
                        featured = true,
                    )
                }
            }

            Spacer(Modifier.weight(1f))

            Text(
                text = "1440×3120 · 120Hz · edge-to-edge · keep-awake",
                color = TextMuted.copy(alpha = 0.7f),
                fontFamily = FontFamily.Monospace,
                fontSize = 11.sp,
                modifier = Modifier.padding(bottom = 18.dp),
            )
        }
    }
}

@Composable
private fun ModeLaunch(
    title: String,
    subtitle: String,
    icon: ImageVector,
    onClick: () -> Unit,
    featured: Boolean = false,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(if (featured) Panel else Ink)
            .border(
                width = 1.dp,
                color = if (featured) SignalDim else Line,
                shape = RoundedCornerShape(16.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(if (featured) Signal.copy(alpha = 0.15f) else Panel),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = Signal)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = TextPrimary, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            Text(subtitle, color = TextMuted, fontSize = 13.sp, fontFamily = FontFamily.Monospace)
        }
        Text("→", color = Signal, fontSize = 20.sp, fontWeight = FontWeight.Bold)
    }
}

private fun hostLabel(url: String): String = try {
    java.net.URI(url).host ?: url
} catch (_: Exception) {
    url
}
