package com.koreadatamap.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.SpannableString
import android.text.Spanned
import android.text.method.LinkMovementMethod
import android.text.style.ClickableSpan
import android.view.MenuItem
import android.view.View
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class AboutActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_about)

        // 뒤로가기 버튼 활성화
        supportActionBar?.apply {
            setDisplayHomeAsUpEnabled(true)
            title = getString(R.string.about_title)
        }

        setupDataSourceLinks()
    }

    /**
     * 데이터 출처 TextView에 클릭 가능한 링크 설정
     */
    private fun setupDataSourceLinks() {
        val sources = listOf(
            Triple(
                R.id.tv_source_nec,
                getString(R.string.source_nec_label),
                getString(R.string.source_nec_url)
            ),
            Triple(
                R.id.tv_source_sgis,
                getString(R.string.source_sgis_label),
                getString(R.string.source_sgis_url)
            ),
            Triple(
                R.id.tv_source_mois,
                getString(R.string.source_mois_label),
                getString(R.string.source_mois_url)
            ),
            Triple(
                R.id.tv_source_data_go,
                getString(R.string.source_data_go_label),
                getString(R.string.source_data_go_url)
            )
        )

        sources.forEach { (viewId, label, url) ->
            val textView = findViewById<TextView>(viewId)
            textView.text = makeClickableLink(label, url)
            textView.movementMethod = LinkMovementMethod.getInstance()
        }
    }

    /**
     * 텍스트 전체를 클릭 시 외부 브라우저로 여는 SpannableString 반환
     */
    private fun makeClickableLink(label: String, url: String): SpannableString {
        return SpannableString(label).apply {
            setSpan(
                object : ClickableSpan() {
                    override fun onClick(widget: View) {
                        openUrl(url)
                    }
                },
                0, length,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
            )
        }
    }

    private fun openUrl(url: String) {
        runCatching {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
