# NXPayment Merchant (Flutter)

Merchant till app: local API URL config, pending Confirm/Reject, basic tally.

## Run

Requires Flutter SDK 3.3+.

```bash
cd apps/mobile
flutter pub get
flutter run
```

Point the setup screen at your API (default `http://127.0.0.1:3847`). On a physical device, use your machine LAN IP.

Buyer checkout stays on the web SimpleCheckout (`/checkout`); this app is the merchant confirm surface.
