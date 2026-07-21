import 'package:calorix/shared/services/retry_analysis_service.dart';
import 'package:cloud_functions/cloud_functions.dart';
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

  test('surfaces callable failures as typed retry errors', () async {
    final service = CloudRetryAnalysisService((_, __) async {
      throw FirebaseFunctionsException(
        code: 'failed-precondition',
        message: 'Entry is already processing',
      );
    });

    await expectLater(
      service.retryEntryAnalysis('e1'),
      throwsA(isA<RetryAnalysisException>()
          .having((error) => error.code, 'code', 'failed-precondition')
          .having(
            (error) => error.message,
            'message',
            'Entry is already processing',
          )),
    );
  });
}
