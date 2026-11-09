package com.worldwidevapor.ai;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (bridge != null) {
            bridge.setWebViewClient(new WorkspaceWebViewClient(bridge));
        }
    }

    /**
     * Capacitor replaces the page with its error page (errorPath, www/offline.html) both when the phone can't reach the site
     * and when the site answers with an error status. An answer is the site's to show: its "not found", its error page, a
     * security check that needs a moment. So only a page that didn't arrive at all gets the error page, which is told what
     * went wrong and where, with the address's path only (never its query, which can hold a one-time code).
     */
    static final class WorkspaceWebViewClient extends BridgeWebViewClient {

        private final Bridge bridge;
        /** What went wrong and where, for the error page about to load. */
        private String pendingDetail;

        WorkspaceWebViewClient(Bridge bridge) {
            super(bridge);
            this.bridge = bridge;
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            // Deliberately not Capacitor's: the site's own page stays on screen.
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            String errorUrl = bridge.getErrorUrl();
            Uri page = request.getUrl();
            // The error page failing too gets the web view's own message, not another try at the error page.
            if (errorUrl == null || !request.isForMainFrame() || page.toString().startsWith(errorUrl)) {
                return;
            }
            String where = (page.getHost() == null ? "" : page.getHost()) + (page.getPath() == null ? "" : page.getPath());
            CharSequence description = error.getDescription();
            String reason = description == null || description.length() == 0 ? "error " + error.getErrorCode() : description.toString();
            // Not in the error page's address: Capacitor serves it only at exactly that address (no query, no "#"). The
            // page is handed the details once it has loaded (onPageFinished).
            pendingDetail = reason + " · " + where;
            view.loadUrl(errorUrl);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            String errorUrl = bridge.getErrorUrl();
            if (pendingDetail != null && errorUrl != null && errorUrl.equals(url)) {
                view.evaluateJavascript("window.showDetail && window.showDetail(" + JSONObject.quote(pendingDetail) + ")", null);
                pendingDetail = null;
            }
        }
    }
}
