package com.nxpayment.nxpayment_merchant

import android.content.Context
import android.content.Intent
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
  override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
    super.configureFlutterEngine(flutterEngine)
    MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
      .setMethodCallHandler { call, result ->
        val prefs = getSharedPreferences(CreditNotificationListener.PREFS, Context.MODE_PRIVATE)
        when (call.method) {
          "requestNotificationAccess" -> {
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            result.success(true)
          }
          "enableObserver" -> {
            val apiUrl = call.argument<String>("apiUrl")
            prefs.edit()
              .putBoolean(CreditNotificationListener.KEY_ENABLED, true)
              .putString(CreditNotificationListener.KEY_API, apiUrl)
              .apply()
            result.success(true)
          }
          "disableObserver" -> {
            prefs.edit().putBoolean(CreditNotificationListener.KEY_ENABLED, false).apply()
            result.success(true)
          }
          else -> result.notImplemented()
        }
      }
  }

  companion object {
    private const val CHANNEL = "nxpayment/credit_observer"
  }
}
