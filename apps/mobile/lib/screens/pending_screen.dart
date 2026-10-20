import 'dart:async';
import 'package:flutter/material.dart';
import '../models/payment.dart';
import '../services/api.dart';

class PendingScreen extends StatefulWidget {
  const PendingScreen({super.key, required this.api});

  final NxApi api;

  @override
  State<PendingScreen> createState() => _PendingScreenState();
}

class _PendingScreenState extends State<PendingScreen> {
  List<Payment> _payments = [];
  String? _error;
  String? _busyId;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 2), (_) => _load());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final list = await widget.api.pending();
      if (!mounted) return;
      setState(() {
        _payments = list;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  Future<void> _act(Payment p, bool confirm) async {
    setState(() => _busyId = p.id);
    try {
      if (confirm) {
        await widget.api.confirm(p.id);
      } else {
        await widget.api.reject(p.id);
      }
      await _load();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Confirm payments')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(_error!, style: const TextStyle(color: Color(0xFF9B2C2C))),
            ),
          if (_payments.isEmpty)
            const Padding(
              padding: EdgeInsets.only(top: 48),
              child: Center(child: Text('No pending payments')),
            ),
          ..._payments.map((p) {
            final busy = _busyId == p.id;
            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Confirm this amount',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            color: const Color(0xFF5C6B63),
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      p.amountLabel,
                      style: Theme.of(context).textTheme.displaySmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${p.note ?? p.merchantOrderId ?? p.id} · ${p.status}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton(
                            onPressed: busy ? null : () => _act(p, true),
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFF0B6E4F),
                              minimumSize: const Size.fromHeight(48),
                            ),
                            child: const Text('Confirm'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton(
                            onPressed: busy ? null : () => _act(p, false),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: const Color(0xFF9B2C2C),
                              minimumSize: const Size.fromHeight(48),
                            ),
                            child: const Text('Reject'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}
