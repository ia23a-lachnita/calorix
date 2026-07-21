import 'package:calorix/shared/services/retry_analysis_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('calls retryEntryAnalysis with only the entry ID', () async {
    String? name;
    Map<String, Object?>? payload;
    final service = CloudRetryAnalysisService((callable, data) async {
      name = callable;
      payload = data;
      return {'ok': true};
    });

    await service.retryEntryAnalysis('entry-123');

    expect(name, 'retryEntryAnalysis');
    expect(payload, {'entryId': 'entry-123'});
  });

  test('rejects an empty entry ID before invoking the callable', () async {
    var calls = 0;
    final service = CloudRetryAnalysisService((_, __) async {
      calls++;
      return null;
    });

    await expectLater(
      service.retryEntryAnalysis(''),
      throwsA(isA<RetryAnalysisException>().having(
        (error) => error.code,
        'code',
        'invalid-argument',
      )),
    );
    expect(calls, 0);
  });
}
