package pk.com.learnersacademy.portal;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Honour the page's <meta name="viewport"> width, as Chrome does. Android's
        // web view ignores it by default, which leaves no way to show a wider
        // ("laptop") layout scaled down to fit the screen.
        getBridge().getWebView().getSettings().setUseWideViewPort(true);
    }
}
