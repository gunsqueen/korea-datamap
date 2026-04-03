package com.koreadatamap.app

import android.content.Intent
import android.os.Bundle
import android.view.View
import com.getcapacitor.BridgeActivity
import com.google.android.material.floatingactionbutton.FloatingActionButton

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

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
            gravity = android.view.Gravity.BOTTOM or android.view.Gravity.END
            val margin = (16 * resources.displayMetrics.density).toInt()
            setMargins(margin, margin, margin, (margin * 4.5f).toInt())
        }

        fab.setOnClickListener {
            startActivity(Intent(this, AboutActivity::class.java))
        }

        // CoordinatorLayout에 FAB 추가
        val rootView = window.decorView.findViewById<View>(android.R.id.content)
        (rootView as? android.view.ViewGroup)?.let { root ->
            val coordinator = root.getChildAt(0)
            if (coordinator is androidx.coordinatorlayout.widget.CoordinatorLayout) {
                coordinator.addView(fab, params)
            }
        }
    }
}
