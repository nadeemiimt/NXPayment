import 'package:flutter/material.dart';

class SetupScreen extends StatefulWidget {
  const SetupScreen({
    super.key,
    required this.initialUrl,
    required this.onSaved,
  });

  final String initialUrl;
  final ValueChanged<String> onSaved;

  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  late final TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialUrl);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'NXPayment',
                style: Theme.of(context).textTheme.displaySmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: const Color(0xFF14201B),
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                'Merchant till — point at your install API, then confirm amounts.',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: const Color(0xFF5C6B63),
                    ),
              ),
              const SizedBox(height: 32),
              TextField(
                controller: _controller,
                decoration: const InputDecoration(
                  labelText: 'API base URL',
                  border: OutlineInputBorder(),
                  hintText: 'http://127.0.0.1:3847',
                ),
                keyboardType: TextInputType.url,
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton(
                  onPressed: () {
                    final url = _controller.text.trim().replaceAll(RegExp(r'/$'), '');
                    if (url.isNotEmpty) widget.onSaved(url);
                  },
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF0B6E4F),
                  ),
                  child: const Text('Continue'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
