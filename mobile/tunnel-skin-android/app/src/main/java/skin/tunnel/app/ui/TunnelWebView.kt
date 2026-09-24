package skin.tunnel.app.ui

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.view.ViewGroup
import android.webkit.HttpAuthHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import skin.tunnel.app.TunnelSettings

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun TunnelWebView(
    url: String,
    settings: TunnelSettings,
    modifier: Modifier = Modifier,
    desktopMode: Boolean = false,
    handle: WebViewHandle? = null,
    onTitle: (String?) -> Unit = {},
    onLoading: (Boolean) -> Unit = {},
) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                setBackgroundColor(0xFF070A0C.toInt())
                isFocusable = true
                isFocusableInTouchMode = true
                overScrollMode = WebView.OVER_SCROLL_NEVER
                handle?.webView = this

                with(this.settings) {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    databaseEnabled = true
                    mediaPlaybackRequiresUserGesture = false
                    loadWithOverviewMode = true
                    useWideViewPort = true
                    builtInZoomControls = desktopMode
                    displayZoomControls = false
                    setSupportZoom(desktopMode)
                    mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                    cacheMode = WebSettings.LOAD_DEFAULT
                    userAgentString = "$userAgentString TunnelSkin/1.0 GalaxyS25Ultra"
                    textZoom = if (desktopMode) {
                        (100 * settings.desktopScale).toInt().coerceIn(75, 150)
                    } else {
                        100
                    }
                }

                webChromeClient = object : WebChromeClient() {
                    override fun onReceivedTitle(view: WebView?, title: String?) {
                        onTitle(title)
                    }
                }

                webViewClient = object : WebViewClient() {
                    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                        onLoading(true)
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                        onLoading(false)
                        if (!desktopMode) {
                            view?.evaluateJavascript(
                                """
                                (function(){
                                  document.documentElement.style.height='100%';
                                  document.body.style.height='100%';
                                  document.body.style.margin='0';
                                  var t=document.querySelector('.xterm,.terminal,canvas');
                                  if(t){t.style.touchAction='none';}
                                })();
                                """.trimIndent(),
                                null,
                            )
                        } else {
                            view?.evaluateJavascript(
                                """
                                (function(){
                                  var meta=document.querySelector('meta[name=viewport]');
                                  if(!meta){
                                    meta=document.createElement('meta');
                                    meta.name='viewport';
                                    document.head.appendChild(meta);
                                  }
                                  meta.content='width=device-width, initial-scale=1, maximum-scale=3, user-scalable=yes';
                                  document.body.style.overscrollBehavior='none';
                                })();
                                """.trimIndent(),
                                null,
                            )
                        }
                    }

                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest?,
                    ): Boolean {
                        val host = request?.url?.host.orEmpty()
                        return host.isNotEmpty() && !host.endsWith("tunnel.skin")
                    }

                    override fun onReceivedHttpAuthRequest(
                        view: WebView?,
                        handler: HttpAuthHandler?,
                        host: String?,
                        realm: String?,
                    ) {
                        val user = settings.terminalUser
                        val pass = settings.terminalPassword
                        if (user.isNotBlank() && pass.isNotBlank()) {
                            handler?.proceed(user, pass)
                        } else {
                            handler?.cancel()
                        }
                    }
                }

                loadUrl(url)
            }
        },
        update = { view ->
            handle?.webView = view
            if (view.url != url && url.isNotBlank()) {
                view.loadUrl(url)
            }
            view.settings.textZoom = if (desktopMode) {
                (100 * settings.desktopScale).toInt().coerceIn(75, 150)
            } else {
                100
            }
        },
    )
}

fun WebView.sendTerminalKeys(keys: String) {
    val escaped = keys
        .replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace("\n", "\\n")
    evaluateJavascript(
        """
        (function(){
          function dispatch(target, type, key, code, keyCode, ctrl, alt){
            var ev = new KeyboardEvent(type, {
              key: key, code: code, keyCode: keyCode, which: keyCode,
              ctrlKey: !!ctrl, altKey: !!alt, bubbles: true, cancelable: true
            });
            (target||document).dispatchEvent(ev);
          }
          var map = {
            'ESC': ['Escape','Escape',27],
            'TAB': ['Tab','Tab',9],
            'UP': ['ArrowUp','ArrowUp',38],
            'DOWN': ['ArrowDown','ArrowDown',40],
            'LEFT': ['ArrowLeft','ArrowLeft',37],
            'RIGHT': ['ArrowRight','ArrowRight',39],
            'HOME': ['Home','Home',36],
            'END': ['End','End',35],
            'PGUP': ['PageUp','PageUp',33],
            'PGDN': ['PageDown','PageDown',34],
            'ENTER': ['Enter','Enter',13],
            'BKSP': ['Backspace','Backspace',8]
          };
          var raw = '$escaped';
          var ctrl = raw.indexOf('CTRL+') === 0;
          var alt = raw.indexOf('ALT+') === 0 || raw.indexOf('CTRL+ALT+') === 0;
          var token = raw.replace('CTRL+','').replace('ALT+','');
          var target = document.activeElement || document.querySelector('.xterm-helper-textarea') || document.body;
          if (target && target.focus) try { target.focus(); } catch(e) {}
          if (map[token]) {
            var m = map[token];
            dispatch(target,'keydown', m[0], m[1], m[2], ctrl, alt);
            dispatch(target,'keyup', m[0], m[1], m[2], ctrl, alt);
          } else if (ctrl && token.length === 1) {
            var ch = token.toLowerCase();
            dispatch(target,'keydown', ch, 'Key'+token.toUpperCase(), ch.charCodeAt(0), true, alt);
            dispatch(target,'keyup', ch, 'Key'+token.toUpperCase(), ch.charCodeAt(0), true, alt);
          } else {
            token.split('').forEach(function(ch){
              dispatch(target,'keydown', ch, ch, ch.charCodeAt(0), false, false);
              dispatch(target,'keypress', ch, ch, ch.charCodeAt(0), false, false);
              dispatch(target,'keyup', ch, ch, ch.charCodeAt(0), false, false);
            });
          }
        })();
        """.trimIndent(),
        null,
    )
}
