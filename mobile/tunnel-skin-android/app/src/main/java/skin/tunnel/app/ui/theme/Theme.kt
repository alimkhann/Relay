package skin.tunnel.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Void = Color(0xFF070A0C)
val Ink = Color(0xFF0C1216)
val Panel = Color(0xFF121A1F)
val Line = Color(0xFF1E2C33)
val Signal = Color(0xFF5CFFB0)
val SignalDim = Color(0xFF2A7A58)
val Warn = Color(0xFFFFB454)
val TextPrimary = Color(0xFFE6F2EC)
val TextMuted = Color(0xFF7E9490)

private val TunnelColors = darkColorScheme(
    primary = Signal,
    onPrimary = Void,
    secondary = SignalDim,
    onSecondary = TextPrimary,
    background = Void,
    onBackground = TextPrimary,
    surface = Panel,
    onSurface = TextPrimary,
    surfaceVariant = Ink,
    onSurfaceVariant = TextMuted,
    outline = Line,
    error = Warn,
)

@Composable
fun TunnelTheme(content: @Composable () -> Unit) {
    // Always dark — remote console aesthetic, AMOLED-friendly for S25 Ultra.
    MaterialTheme(
        colorScheme = TunnelColors,
        typography = MaterialTheme.typography.copy(
            displayLarge = TextStyle(
                fontFamily = FontFamily.SansSerif,
                fontWeight = FontWeight.Black,
                fontSize = 48.sp,
                letterSpacing = (-1.5).sp,
                color = TextPrimary,
            ),
            headlineMedium = TextStyle(
                fontFamily = FontFamily.SansSerif,
                fontWeight = FontWeight.Bold,
                fontSize = 28.sp,
                letterSpacing = (-0.5).sp,
                color = TextPrimary,
            ),
            titleLarge = TextStyle(
                fontFamily = FontFamily.SansSerif,
                fontWeight = FontWeight.SemiBold,
                fontSize = 20.sp,
                color = TextPrimary,
            ),
            bodyLarge = TextStyle(
                fontFamily = FontFamily.SansSerif,
                fontWeight = FontWeight.Normal,
                fontSize = 16.sp,
                color = TextPrimary,
            ),
            bodyMedium = TextStyle(
                fontFamily = FontFamily.SansSerif,
                fontSize = 14.sp,
                color = TextMuted,
            ),
            labelLarge = TextStyle(
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Medium,
                fontSize = 13.sp,
                letterSpacing = 0.8.sp,
                color = Signal,
            ),
        ),
        content = content,
    )
    // Silence unused import warning for isSystemInDarkTheme if tooling expects it
    @Suppress("UNUSED_VARIABLE")
    val _dark = isSystemInDarkTheme()
}
