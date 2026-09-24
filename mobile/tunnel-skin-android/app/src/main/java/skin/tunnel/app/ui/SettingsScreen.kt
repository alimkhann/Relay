package skin.tunnel.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import skin.tunnel.app.Defaults
import skin.tunnel.app.TunnelSettings
import skin.tunnel.app.ui.theme.Ink
import skin.tunnel.app.ui.theme.Line
import skin.tunnel.app.ui.theme.Signal
import skin.tunnel.app.ui.theme.TextMuted
import skin.tunnel.app.ui.theme.TextPrimary
import skin.tunnel.app.ui.theme.Void

@Composable
fun SettingsScreen(
    settings: TunnelSettings,
    onBack: () -> Unit,
    onSave: (TunnelSettings) -> Unit,
) {
    BackHandler(onBack = onBack)

    var desktopUrl by remember(settings) { mutableStateOf(settings.desktopUrl) }
    var terminalUrl by remember(settings) { mutableStateOf(settings.terminalUrl) }
    var user by remember(settings) { mutableStateOf(settings.terminalUser) }
    var pass by remember(settings) { mutableStateOf(settings.terminalPassword) }
    var keepOn by remember(settings) { mutableStateOf(settings.keepScreenOn) }
    var immersive by remember(settings) { mutableStateOf(settings.immersiveDesktop) }
    var extraKeys by remember(settings) { mutableStateOf(settings.showTerminalExtraKeys) }
    var landscape by remember(settings) { mutableStateOf(settings.preferLandscapeDesktop) }
    var scale by remember(settings) { mutableStateOf(settings.desktopScale.toString()) }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = Signal,
        unfocusedBorderColor = Line,
        focusedLabelColor = Signal,
        unfocusedLabelColor = TextMuted,
        cursorColor = Signal,
        focusedTextColor = TextPrimary,
        unfocusedTextColor = TextPrimary,
    )

    Column(
        Modifier
            .fillMaxSize()
            .background(Void)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .background(Ink)
                .padding(horizontal = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back", tint = TextPrimary)
            }
            Text(
                text = "Settings",
                color = TextPrimary,
                fontWeight = FontWeight.SemiBold,
                fontSize = 18.sp,
                modifier = Modifier.weight(1f),
            )
            TextButton(
                onClick = {
                    onSave(
                        TunnelSettings(
                            desktopUrl = desktopUrl.ifBlank { Defaults.DESKTOP_URL },
                            terminalUrl = terminalUrl.ifBlank { Defaults.TERMINAL_URL },
                            terminalUser = user,
                            terminalPassword = pass,
                            keepScreenOn = keepOn,
                            immersiveDesktop = immersive,
                            showTerminalExtraKeys = extraKeys,
                            preferLandscapeDesktop = landscape,
                            desktopScale = scale.toFloatOrNull()?.coerceIn(0.75f, 1.5f) ?: 1.0f,
                        ),
                    )
                    onBack()
                },
            ) {
                Text("Save", color = Signal, fontFamily = FontFamily.Monospace)
            }
        }

        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("ENDPOINTS", color = Signal, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            OutlinedTextField(
                value = desktopUrl,
                onValueChange = { desktopUrl = it },
                label = { Text("Desktop URL") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = fieldColors,
            )
            OutlinedTextField(
                value = terminalUrl,
                onValueChange = { terminalUrl = it },
                label = { Text("Terminal URL") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = fieldColors,
            )

            Spacer(Modifier.height(8.dp))
            Text("TTYD BASIC AUTH", color = Signal, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            Text(
                "Credenciais ficam no EncryptedSharedPreferences do aparelho.",
                color = TextMuted,
                fontSize = 13.sp,
            )
            OutlinedTextField(
                value = user,
                onValueChange = { user = it },
                label = { Text("Usuário") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = fieldColors,
            )
            OutlinedTextField(
                value = pass,
                onValueChange = { pass = it },
                label = { Text("Senha") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                shape = RoundedCornerShape(12.dp),
                colors = fieldColors,
            )

            Spacer(Modifier.height(8.dp))
            Text("S25 ULTRA", color = Signal, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            ToggleRow("Manter tela ligada", keepOn) { keepOn = it }
            ToggleRow("Desktop imersivo (esconder chrome)", immersive) { immersive = it }
            ToggleRow("Teclas extras no terminal", extraKeys) { extraKeys = it }
            ToggleRow("Preferir landscape no desktop", landscape) { landscape = it }

            OutlinedTextField(
                value = scale,
                onValueChange = { scale = it },
                label = { Text("Escala do desktop (0.75–1.5)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                shape = RoundedCornerShape(12.dp),
                colors = fieldColors,
            )

            Spacer(Modifier.height(12.dp))
            TextButton(
                onClick = {
                    desktopUrl = Defaults.DESKTOP_URL
                    terminalUrl = Defaults.TERMINAL_URL
                },
            ) {
                Text("Restaurar URLs padrão", color = TextMuted)
            }
        }
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = TextPrimary, modifier = Modifier.weight(1f))
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Void,
                checkedTrackColor = Signal,
                uncheckedThumbColor = TextMuted,
                uncheckedTrackColor = Ink,
            ),
        )
    }
}
