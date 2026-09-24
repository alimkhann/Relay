package skin.tunnel.app.ui

import android.view.HapticFeedbackConstants
import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import skin.tunnel.app.ui.theme.Ink
import skin.tunnel.app.ui.theme.Line
import skin.tunnel.app.ui.theme.Panel
import skin.tunnel.app.ui.theme.Signal
import skin.tunnel.app.ui.theme.SignalDim
import skin.tunnel.app.ui.theme.TextPrimary

class WebViewHandle {
    var webView: WebView? = null
}

@Composable
fun ExtraKeysBar(
    handle: WebViewHandle,
    modifier: Modifier = Modifier,
) {
    var ctrl by remember { mutableStateOf(false) }
    var alt by remember { mutableStateOf(false) }
    val view = LocalView.current
    val scroll = rememberScrollState()

    fun tap(label: String) {
        view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
        val web = handle.webView ?: return
        when (label) {
            "CTRL" -> {
                ctrl = !ctrl
                return
            }
            "ALT" -> {
                alt = !alt
                return
            }
            else -> {
                val prefix = buildString {
                    if (ctrl) append("CTRL+")
                    if (alt) append("ALT+")
                }
                web.sendTerminalKeys(prefix + label)
                ctrl = false
                alt = false
            }
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(Ink)
            .padding(horizontal = 8.dp, vertical = 6.dp),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(scroll),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            KeyChip("ESC", active = false, onClick = { tap("ESC") })
            KeyChip("CTRL", active = ctrl, onClick = { tap("CTRL") })
            KeyChip("ALT", active = alt, onClick = { tap("ALT") })
            KeyChip("TAB", active = false, onClick = { tap("TAB") })
            KeyChip("↑", active = false, onClick = { tap("UP") })
            KeyChip("↓", active = false, onClick = { tap("DOWN") })
            KeyChip("←", active = false, onClick = { tap("LEFT") })
            KeyChip("→", active = false, onClick = { tap("RIGHT") })
            KeyChip("HOME", active = false, onClick = { tap("HOME") })
            KeyChip("END", active = false, onClick = { tap("END") })
            KeyChip("PGUP", active = false, onClick = { tap("PGUP") })
            KeyChip("PGDN", active = false, onClick = { tap("PGDN") })
            KeyChip("-", active = false, onClick = { tap("-") })
            KeyChip("|", active = false, onClick = { tap("|") })
            KeyChip("~", active = false, onClick = { tap("~") })
            KeyChip("/", active = false, onClick = { tap("/") })
        }
    }
}

@Composable
private fun KeyChip(
    label: String,
    active: Boolean,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .height(40.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(if (active) SignalDim else Panel)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (active) Signal else TextPrimary,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.SemiBold,
            fontSize = 13.sp,
        )
    }
    // subtle divider cue without cards
    @Suppress("UNUSED_VARIABLE")
    val _line = Line
}
