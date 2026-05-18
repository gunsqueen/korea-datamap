package com.koreadatamap.app

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.coordinatorlayout.widget.CoordinatorLayout
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.getcapacitor.BridgeActivity
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.getcapacitor.android.R as CapacitorR

class MainActivity : BridgeActivity() {
    private var aboutFab: FloatingActionButton? = null
    private var baseFabHorizontalMargin = 0
    private var baseFabBottomMargin = 0
    private var latestSystemBars = Insets.of(0, 0, 0, 0)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        // 테마 어떤 경로로 로드되어도 ActionBar/타이틀이 절대 보이지 않도록 강제 숨김.
        // 웹앱이 직접 헤더("선거지도", 검색, 테마 토글, ...)를 그리므로 네이티브 헤더는 불필요.
        supportActionBar?.hide()

        val content = findViewById<ViewGroup>(android.R.id.content)
        val root = content.getChildAt(0) as? CoordinatorLayout
        val webView = findViewById<WebView>(CapacitorR.id.webview)

        if (root != null && webView != null) {
            applySystemBarInsets(root, webView)
            addAboutButton(root)
        }
    }

    private fun applySystemBarInsets(root: CoordinatorLayout, webView: WebView) {
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, windowInsets ->
            latestSystemBars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            webView.setPadding(
                latestSystemBars.left,
                latestSystemBars.top,
                latestSystemBars.right,
                latestSystemBars.bottom
            )
            updateAboutButtonInsets()
            windowInsets
        }
        ViewCompat.requestApplyInsets(root)
    }

    private fun addAboutButton(root: CoordinatorLayout) {
        // About 버튼 (우하단 FAB) 추가 — 1회 탭으로 앱 정보 접근
        val fab = FloatingActionButton(this).apply {
            setImageResource(android.R.drawable.ic_menu_info_details)
            contentDescription = getString(R.string.about_button_desc)
            alpha = 0.85f
        }

        val params = androidx.coordinatorlayout.widget.CoordinatorLayout.LayoutParams(
            androidx.coordinatorlayout.widget.CoordinatorLayout.LayoutParams.WRAP_CONTENT,
            androidx.coordinatorlayout.widget.CoordinatorLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.END
            val margin = (16 * resources.displayMetrics.density).toInt()
            baseFabHorizontalMargin = margin
            baseFabBottomMargin = (margin * 4.5f).toInt()
            setMargins(margin, margin, margin, baseFabBottomMargin)
        }

        fab.setOnClickListener {
            startActivity(Intent(this, AboutActivity::class.java))
        }

        aboutFab = fab
        root.addView(fab, params)
        updateAboutButtonInsets()
    }

    private fun updateAboutButtonInsets() {
        aboutFab?.let { fab ->
            val params = fab.layoutParams as? CoordinatorLayout.LayoutParams ?: return
            params.setMargins(
                baseFabHorizontalMargin + latestSystemBars.left,
                baseFabHorizontalMargin,
                baseFabHorizontalMargin + latestSystemBars.right,
                baseFabBottomMargin + latestSystemBars.bottom
            )
            fab.layoutParams = params
        }
    }
}
