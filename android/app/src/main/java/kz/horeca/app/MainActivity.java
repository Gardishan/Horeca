package kz.horeca.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;

public final class MainActivity extends Activity {
    private WebView webView;
    private ProgressBar progressBar;
    private Uri trustedAppUri;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.web_view);
        progressBar = findViewById(R.id.progress_bar);
        trustedAppUri = Uri.parse(BuildConfig.WEB_APP_URL);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if (isTrustedAppUri(uri)) {
                    return false;
                }
                if (
                    "http".equals(scheme) ||
                    "https".equals(scheme) ||
                    "mailto".equals(scheme) ||
                    "tel".equals(scheme)
                ) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) {
                        // No safe external handler is installed: remain in the app.
                    }
                }
                return true;
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(BuildConfig.WEB_APP_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private boolean isTrustedAppUri(Uri uri) {
        return trustedAppUri.getScheme() != null
            && trustedAppUri.getScheme().equals(uri.getScheme())
            && trustedAppUri.getHost() != null
            && trustedAppUri.getHost().equalsIgnoreCase(uri.getHost())
            && trustedAppUri.getPort() == uri.getPort();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
