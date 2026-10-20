class Payment {
  Payment({
    required this.id,
    required this.amountPaise,
    required this.status,
    this.note,
    this.merchantOrderId,
    required this.expiresAt,
  });

  final String id;
  final int amountPaise;
  final String status;
  final String? note;
  final String? merchantOrderId;
  final DateTime expiresAt;

  factory Payment.fromJson(Map<String, dynamic> json) {
    return Payment(
      id: json['id'] as String,
      amountPaise: json['amountPaise'] as int,
      status: json['status'] as String,
      note: json['note'] as String?,
      merchantOrderId: json['merchantOrderId'] as String?,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );
  }

  String get amountLabel {
    final rupees = amountPaise / 100.0;
    return '₹${rupees.toStringAsFixed(2)}';
  }
}

class Tally {
  Tally({
    required this.successCount,
    required this.failedCount,
    required this.totalSalesPaise,
  });

  final int successCount;
  final int failedCount;
  final int totalSalesPaise;

  factory Tally.fromJson(Map<String, dynamic> json) {
    return Tally(
      successCount: json['successCount'] as int,
      failedCount: json['failedCount'] as int,
      totalSalesPaise: json['totalSalesPaise'] as int,
    );
  }
}
