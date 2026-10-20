import 'package:flutter/material.dart';
import '../models/payment.dart';
import '../services/api.dart';
import 'auto_confirm_screen.dart';
import 'pending_screen.dart';
import 'tally_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({
    super.key,
    required this.apiUrl,
    required this.onReset,
  });

  final String apiUrl;
  final VoidCallback onReset;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late final NxApi _api;
  int _pending = 0;
  Tally? _tally;
  String? _error;

  @override
  void initState() {
    super.initState();
    _api = NxApi(baseUrl: widget.apiUrl);
    _refresh();
  }

  Future<void> _refresh() async {
    try {
      final pending = await _api.pending();
      final tally = await _api.tally();
      setState(() {
        _pending = pending.length;
        _tally = tally;
        _error = null;
      });
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('NXPayment Merchant'),
        actions: [
          IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh)),
          IconButton(onPressed: widget.onReset, icon: const Icon(Icons.settings)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              'Pending confirms',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              '$_pending',
              style: Theme.of(context).textTheme.displayMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF0B6E4F),
                  ),
            ),
            if (_tally != null) ...[
              const SizedBox(height: 24),
              Text('Tally', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              Text(
                'Success ${_tally!.successCount} · Failed ${_tally!.failedCount} · '
                'Sales ₹${(_tally!.totalSalesPaise / 100).toStringAsFixed(2)}',
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!, style: const TextStyle(color: Color(0xFF9B2C2C))),
            ],
            const SizedBox(height: 32),
            FilledButton(
              onPressed: () async {
                await Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => PendingScreen(api: _api),
                  ),
                );
                _refresh();
              },
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0B6E4F),
                minimumSize: const Size.fromHeight(52),
              ),
              child: const Text('Review pending'),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => TallyScreen(api: _api)),
                );
              },
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
              child: const Text('Open tally'),
            ),
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => AutoConfirmScreen(apiUrl: widget.apiUrl),
                  ),
                );
              },
              style: OutlinedButton.styleFrom(
                minimumSize: const Size.fromHeight(52),
              ),
              child: const Text('Auto-confirm (SMS / Gmail)'),
            ),
          ],
        ),
      ),
    );
  }
}
