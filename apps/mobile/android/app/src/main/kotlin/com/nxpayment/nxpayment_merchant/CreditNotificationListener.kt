package com.nxpayment.nxpayment_merchant

import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * Android Notification Listener → POST /api/credits/observe
 * Inspired by YouPI-PG android-observer NotificationListener pattern;
 * posts raw notification text for YouPI-style bank-alert parsing on the API.
 */
class CreditNotificationListener : NotificationListenerService() {
  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) return
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (!prefs.getBoolean(KEY_ENABLED, false)) return
    val apiUrl = prefs.getString(KEY_API, null) ?: return

    val extras = sbn.notification?.extras ?: return
    val title = extras.getCharSequence("android.title")?.toString().orEmpty()
    val text = extras.getCharSequence("android.text")?.toString().orEmpty()
    val raw = "$title $text".trim()
    if (raw.isEmpty()) return
    // Cheap filter before network
    if (!raw.contains(Regex("credited|received|UPI|Rs\\.?|₹|INR", RegexOption.IGNORE_CASE))) return

    Thread {
      try {
        val url = URL(apiUrl.trimEnd('/') + "/api/credits/observe")
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput = true
        val body = JSONObject()
          .put("source", "android_notification")
          .put("rawText", raw)
        OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
        val code = conn.responseCode
        Log.i(TAG, "observe HTTP $code")
        conn.disconnect()
      } catch (e: Exception) {
        Log.w(TAG, "observe failed: ${e.message}")
      }
    }.start()
  }

  companion object {
    const val TAG = "NxCreditNL"
    const val PREFS = "nxpayment_observer"
    const val KEY_ENABLED = "enabled"
    const val KEY_API = "apiUrl"
  }
}
