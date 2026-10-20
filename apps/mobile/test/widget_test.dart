import 'package:flutter_test/flutter_test.dart';
import 'package:nxpayment_merchant/main.dart';

void main() {
  testWidgets('NXPayment app boots', (tester) async {
    await tester.pumpWidget(const NxPaymentApp());
    await tester.pump();
    expect(find.textContaining('NXPayment'), findsWidgets);
  });
}
