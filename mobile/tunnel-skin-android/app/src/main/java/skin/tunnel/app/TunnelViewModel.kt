package skin.tunnel.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import skin.tunnel.app.data.SettingsRepository

data class UiState(
    val settings: TunnelSettings = TunnelSettings(),
    val mode: SessionMode? = null,
    val loading: Boolean = false,
    val title: String? = null,
    val chromeVisible: Boolean = true,
)

class TunnelViewModel(
    private val repo: SettingsRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        _state.update { it.copy(settings = repo.load()) }
    }

    fun open(mode: SessionMode) {
        _state.update { it.copy(mode = mode, chromeVisible = mode != SessionMode.DESKTOP || !it.settings.immersiveDesktop) }
    }

    fun closeSession() {
        _state.update { it.copy(mode = null, title = null, loading = false, chromeVisible = true) }
    }

    fun setLoading(loading: Boolean) {
        _state.update { it.copy(loading = loading) }
    }

    fun setTitle(title: String?) {
        _state.update { it.copy(title = title) }
    }

    fun toggleChrome() {
        _state.update { it.copy(chromeVisible = !it.chromeVisible) }
    }

    fun updateSettings(transform: (TunnelSettings) -> TunnelSettings) {
        viewModelScope.launch {
            val next = transform(_state.value.settings)
            repo.save(next)
            _state.update { it.copy(settings = next) }
        }
    }

    companion object {
        fun factory(repo: SettingsRepository) = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return TunnelViewModel(repo) as T
            }
        }
    }
}
