import 'package:flutter/material.dart';
import '../models/payment.dart';
import '../services/api.dart';

class TallyScreen extends StatefulWidget {
  const TallyScreen({super.key, required this.api});

  final NxApi api;

  @override
  State<TallyScreen> createState() => _TallyScreenState();
}

class _TallyScreenState extends State<TallyScreen> {
  Tally? _tally;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final t = await widget.api.tally();
      setState(() {
        _tally = t;
        _error = null;
      });
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Tally')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Color(0xFF9B2C2C))),
            if (_tally != null) ...[
              _row('Success', '${_tally!.successCount}'),
              _row('Failed', '${_tally!.failedCount}'),
              _row(
                'Total sales',
                '₹${(_tally!.totalSalesPaise / 100).toStringAsFixed(2)}',
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: Theme.of(context).textTheme.titleMedium),
          Text(
            value,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
        ],
      ),
    );
  }
}
