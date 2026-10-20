import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/credit_observer.dart';

/// Auto-confirm settings.
/// Android: Notification Listener / SMS → match-credit API.
/// iOS: cannot read SMS/other apps' notifications — use Gmail email poller on the API.
class AutoConfirmScreen extends StatefulWidget {
  const AutoConfirmScreen({super.key, required this.apiUrl});

  final String apiUrl;

  @override
  State<AutoConfirmScreen> createState() => _AutoConfirmScreenState();
}

class _AutoConfirmScreenState extends State<AutoConfirmScreen> {
  static const _channel = MethodChannel('nxpayment/credit_observer');
  bool _androidEnabled = false;
  bool _emailRely = true;
  String? _status;
  final _sampleCtrl = TextEditingController(
    text:
        'Dear SBI user, A/C credited by Rs 1.00 on UPI Ref: UTRDEMO001 from buyer@upi',
  );

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _androidEnabled = prefs.getBool('androidAutoConfirm') ?? false;
      _emailRely = prefs.getBool('emailAutoConfirmUi') ?? true;
    });
  }

  Future<void> _setAndroid(bool v) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('androidAutoConfirm', v);
    setState(() => _androidEnabled = v);
    if (Platform.isAndroid) {
      try {
        if (v) {
          await _channel.invokeMethod('requestNotificationAccess');
          await _channel.invokeMethod('enableObserver', {'apiUrl': widget.apiUrl});
          setState(() => _status = 'Android observer enabled — grant Notification access in system settings.');
        } else {
          await _channel.invokeMethod('disableObserver');
          setState(() => _status = 'Android observer disabled.');
        }
      } on PlatformException catch (e) {
        setState(() => _status = 'Native bridge: ${e.message}');
      } on MissingPluginException {
        setState(() =>
            _status = 'Native Notification Listener not linked in this build — API observe still works via paste below.');
      }
    } else if (Platform.isIOS) {
      setState(() => _status =
          'iOS cannot read SMS or other apps’ notifications. Enable Gmail auto-confirm on the web/API poller.');
    }
  }

  Future<void> _pasteSample() async {
    try {
      final api = CreditObserverApi(baseUrl: widget.apiUrl);
      final source = Platform.isAndroid ? 'android_notification' : 'sms';
      final r = await api.observe(source: source, rawText: _sampleCtrl.text);
      setState(() => _status = 'Observe result: ${r['outcome']} — ${r['message']}');
    } catch (e) {
      setState(() => _status = 'Error: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Auto-confirm')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            'Payment verification = Bank SMS & Gmail alerts parsed in near real time — not aggregator webhooks. Manual Confirm stays available.',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: const Color(0xFF5C6B63)),
          ),
          const SizedBox(height: 16),
          SwitchListTile(
            title: const Text('Android: auto-confirm from notifications/SMS'),
            subtitle: const Text('Requires Notification Listener permission'),
            value: _androidEnabled,
            onChanged: (v) => _setAndroid(v),
          ),
          SwitchListTile(
            title: const Text('iOS / all: rely on Gmail email poller'),
            subtitle: const Text('Configure mailbox on Web → Auto-confirm'),
            value: _emailRely,
            onChanged: (v) async {
              final prefs = await SharedPreferences.getInstance();
              await prefs.setBool('emailAutoConfirmUi', v);
              setState(() => _emailRely = v);
            },
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _sampleCtrl,
            maxLines: 4,
            decoration: const InputDecoration(
              labelText: 'Paste bank SMS / notification (dev)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _pasteSample,
            style: FilledButton.styleFrom(backgroundColor: const Color(0xFF0B6E4F)),
            child: const Text('Send to match-credit API'),
          ),
          if (_status != null) ...[
            const SizedBox(height: 16),
            Text(_status!),
          ],
        ],
      ),
    );
  }
}
