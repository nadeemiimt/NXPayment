import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/payment.dart';

class NxApi {
  NxApi({required this.baseUrl});

  final String baseUrl;

  Uri _u(String path) => Uri.parse('$baseUrl$path');

  Future<List<Payment>> pending() async {
    final res = await http.get(_u('/api/payments/pending'));
    _ensureOk(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    final list = body['payments'] as List<dynamic>;
    return list
        .map((e) => Payment.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Payment> confirm(String id) async {
    final res = await http.post(_u('/api/payments/$id/confirm'));
    _ensureOk(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return Payment.fromJson(body['payment'] as Map<String, dynamic>);
  }

  Future<Payment> reject(String id) async {
    final res = await http.post(
      _u('/api/payments/$id/reject'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'reason': 'Rejected from Flutter merchant app'}),
    );
    _ensureOk(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return Payment.fromJson(body['payment'] as Map<String, dynamic>);
  }

  Future<Tally> tally() async {
    final res = await http.get(_u('/api/reports/tally'));
    _ensureOk(res);
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    return Tally.fromJson(body['tally'] as Map<String, dynamic>);
  }

  void _ensureOk(http.Response res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception('API ${res.statusCode}: ${res.body}');
    }
  }
}
