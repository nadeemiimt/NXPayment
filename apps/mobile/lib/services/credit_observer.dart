import 'dart:convert';
import 'package:http/http.dart' as http;

/// Posts parsed bank SMS / notification credits to NXPayment match-credit API.
class CreditObserverApi {
  CreditObserverApi({required this.baseUrl});

  final String baseUrl;

  Future<Map<String, dynamic>> observe({
    required String source,
    String? rawText,
    int? amountPaise,
    String? utr,
  }) async {
    final res = await http.post(
      Uri.parse('$baseUrl/api/credits/observe'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'source': source,
        if (rawText != null) 'rawText': rawText,
        if (amountPaise != null) 'amountPaise': amountPaise,
        if (utr != null) 'utr': utr,
      }),
    );
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('observe ${res.statusCode}: ${res.body}');
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }
}
