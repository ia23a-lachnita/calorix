@Tags(['live'])
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

const _runLive = bool.fromEnvironment('RUN_OFF_LIVE');

void main() {
  test(
    'live OFF v3 lookup exposes the production nutrition contract',
    () async {
      final client = HttpClient();
      try {
        final uri = Uri.https(
          'world.openfoodfacts.org',
          '/api/v3/product/3017624010701',
          {'fields': 'product_name,nutriments'},
        );
        final request = await client.getUrl(uri);
        request.headers.set(
          HttpHeaders.userAgentHeader,
          'Calorix/1.0 (https://github.com/ia23a-lachnita/calorix)',
        );
        request.headers.set(HttpHeaders.acceptHeader, 'application/json');
        final response =
            await request.close().timeout(const Duration(seconds: 10));
        final body = await utf8.decoder.bind(response).join();
        expect(response.statusCode, HttpStatus.ok, reason: body);

        final payload = jsonDecode(body) as Map<String, dynamic>;
        expect(payload['status'], 'success');
        expect(
            (payload['result'] as Map<String, dynamic>)['id'], 'product_found');
        final product = payload['product'] as Map<String, dynamic>;
        expect(product['product_name'], isA<String>());
        final nutrients = product['nutriments'] as Map<String, dynamic>;
        for (final field in const [
          'energy-kcal_100g',
          'proteins_100g',
          'carbohydrates_100g',
          'fat_100g',
        ]) {
          expect(nutrients[field], isA<num>(), reason: 'missing $field');
        }
      } finally {
        client.close(force: true);
      }
    },
    skip: _runLive ? false : 'Set RUN_OFF_LIVE=true with --dart-define.',
  );
}
