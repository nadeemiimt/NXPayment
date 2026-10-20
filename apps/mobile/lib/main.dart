import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'screens/home_screen.dart';
import 'screens/setup_screen.dart';

const _ink = Color(0xFF14201B);
const _paper = Color(0xFFF3EFE6);
const _accent = Color(0xFF0B6E4F);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const NxPaymentApp());
}

class NxPaymentApp extends StatelessWidget {
  const NxPaymentApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NXPayment Merchant',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: _accent,
          brightness: Brightness.light,
          surface: _paper,
        ),
        scaffoldBackgroundColor: _paper,
        appBarTheme: const AppBarTheme(
          backgroundColor: _paper,
          foregroundColor: _ink,
          elevation: 0,
        ),
      ),
      home: const Bootstrap(),
    );
  }
}

class Bootstrap extends StatefulWidget {
  const Bootstrap({super.key});

  @override
  State<Bootstrap> createState() => _BootstrapState();
}

class _BootstrapState extends State<Bootstrap> {
  String? _apiUrl;
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _apiUrl = prefs.getString('apiUrl') ?? 'http://127.0.0.1:3847';
      _ready = prefs.getBool('configured') ?? false;
    });
  }

  Future<void> _onConfigured(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('apiUrl', url);
    await prefs.setBool('configured', true);
    setState(() {
      _apiUrl = url;
      _ready = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_apiUrl == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (!_ready) {
      return SetupScreen(initialUrl: _apiUrl!, onSaved: _onConfigured);
    }
    return HomeScreen(
      apiUrl: _apiUrl!,
      onReset: () async {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setBool('configured', false);
        setState(() => _ready = false);
      },
    );
  }
}
